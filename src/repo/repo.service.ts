import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs-extra';
import type { Archiver } from 'archiver';
import simpleGit from 'simple-git';
import { Cliper } from 'cliper-memory';
import type { SearchResult } from 'cliper-memory';
import { loadConfig, saveConfig } from 'cliper-memory/dist/config/config';
import type { MemoryObject } from 'cliper-memory/dist/sdk/memory/memory';
import { AiService } from '../ai/ai.service';

const REPOSITORY_NOT_INITIALIZED =
  'Repository memory is not initialized; run cliper init first.';
const LOCK_RETRY_MS = 250;
const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 10 * 1000;
const STALE_LOCK_MS = 20 * 60 * 1000;

const createArchive = require('archiver') as (
  format: 'zip',
  options: { zlib: { level: number } },
) => Archiver;

const SEVERITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type RepositoryMetadata = {
  projectName: string;
};

type RepositoryStatistics = {
  language?: string;
  fileCount?: number;
  externalPackageCount?: number;
  modules?: string[];
};

@Injectable()
export class RepoService {
  constructor(private readonly aiService: AiService) {}

  private readonly cliper = new Cliper();

  private repositoryPath(repoId: string): string {
    if (!/^[a-f0-9]{64}$/.test(repoId)) {
      throw new BadRequestException('Invalid repo id');
    }

    return path.join(process.cwd(), 'storage', 'repositories', repoId);
  }

  private async initializedRepositoryPath(repoId: string): Promise<string> {
    const repoPath = this.repositoryPath(repoId);
    const metadataPath = path.join(repoPath, '.cliper', 'metadata.json');

    if (!(await fs.pathExists(metadataPath))) {
      throw new NotFoundException(REPOSITORY_NOT_INITIALIZED);
    }

    return repoPath;
  }

  private async memories(repoId: string): Promise<MemoryObject[]> {
    const repoPath = await this.initializedRepositoryPath(repoId);
    const metadataPath = path.join(repoPath, '.cliper', 'metadata.json');
    const metadata = (await fs.readJson(metadataPath)) as RepositoryMetadata;
    const memoryPath = path.join(
      repoPath,
      '.cliper',
      'memory',
      `cliper-${metadata.projectName}`,
    );

    if (!(await fs.pathExists(memoryPath))) {
      throw new NotFoundException(REPOSITORY_NOT_INITIALIZED);
    }

    const entries = await fs.readdir(memoryPath);
    const files = entries.filter((entry) => entry.endsWith('.json'));
    const memory = await Promise.all(
      files.map(async (file) => {
        try {
          return (await fs.readJson(
            path.join(memoryPath, file),
          )) as MemoryObject;
        } catch {
          return undefined;
        }
      }),
    );

    return memory.filter((item): item is MemoryObject => Boolean(item));
  }

  private async hasCompleteIndex(repoPath: string): Promise<boolean> {
    const metadataPath = path.join(repoPath, '.cliper', 'metadata.json');
    if (!(await fs.pathExists(metadataPath))) return false;

    try {
      const metadata = (await fs.readJson(metadataPath)) as RepositoryMetadata;
      const memoryPath = path.join(
        repoPath,
        '.cliper',
        'memory',
        `cliper-${metadata.projectName}`,
      );
      const entries = await fs.readdir(memoryPath);
      return entries.some((entry) => entry.endsWith('.json'));
    } catch {
      return false;
    }
  }

  private ensureLocalMemoryProvider(): void {
    const config = loadConfig();
    if (config.localJson?.enabled) return;

    saveConfig({
      ...config,
      localJson: { ...config.localJson, enabled: true },
    });
  }

  async init(githubUrl: string) {
    const githubRegex = /^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/;
    if (!githubRegex.test(githubUrl)) {
      throw new BadRequestException('Invalid GitHub repository URL');
    }

    const normalizedUrl = githubUrl
      .replace(/\.git$/, '')
      .replace(/\/$/, '')
      .toLowerCase();
    const repoId = createHash('sha256').update(normalizedUrl).digest('hex');
    return this.withRepositoryLock(repoId, async () => {
      const repoPath = this.repositoryPath(repoId);
      let cloned = false;

      if (!(await fs.pathExists(path.join(repoPath, '.git')))) {
        await simpleGit().clone(normalizedUrl, repoPath, [
          '--depth',
          '1',
          '--filter=blob:none',
        ]);
        cloned = true;
      }

      const alreadyIndexed = await this.hasCompleteIndex(repoPath);
      if (!alreadyIndexed) {
        this.ensureLocalMemoryProvider();
        await this.cliper.init({
          path: repoPath,
          register: false,
          providers: ['local-json'],
        });
      }

      return { success: true, cloned, indexed: true, alreadyIndexed, repoId };
    });
  }

  async sync(repoId: string) {
    return this.withRepositoryLock(repoId, async () => {
      const repoPath = await this.initializedRepositoryPath(repoId);
      const git = simpleGit(repoPath);
      const branchSummary = await git.branch();
      const branch = branchSummary.current;
      if (!branch) {
        throw new BadRequestException(
          'Repository has no checked-out branch to synchronize.',
        );
      }

      const previousHead = (await git.revparse(['HEAD'])).trim();
      await git.raw(['fetch', '--depth', '50', 'origin', branch]);
      await git.raw(['reset', '--hard', `origin/${branch}`]);
      const currentHead = (await git.revparse(['HEAD'])).trim();

      this.ensureLocalMemoryProvider();
      await this.cliper.init({
        path: repoPath,
        register: false,
        providers: ['local-json'],
      });

      return {
        success: true,
        repoId,
        branch,
        updated: previousHead !== currentHead,
        previousHead,
        currentHead,
        indexed: true,
        summary:
          previousHead === currentHead
            ? 'Repository was already up to date; its persistent memory was refreshed.'
            : 'Repository was updated from its remote branch and its persistent memory was refreshed.',
      };
    });
  }

  private async withRepositoryLock<T>(
    repoId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const repoPath = this.repositoryPath(repoId);
    const lockPath = path.join(
      path.dirname(repoPath),
      `.${repoId}.precure.lock`,
    );
    const configuredLockWait = Number.parseInt(
      process.env.PRECURE_LOCK_WAIT_TIMEOUT_MS ?? '',
      10,
    );
    const lockWaitTimeout =
      Number.isFinite(configuredLockWait) && configuredLockWait >= 0
        ? configuredLockWait
        : DEFAULT_LOCK_WAIT_TIMEOUT_MS;
    const deadline = Date.now() + lockWaitTimeout;

    await fs.ensureDir(path.dirname(lockPath));
    while (true) {
      try {
        await fs.writeFile(lockPath, `${Date.now()}`, { flag: 'wx' });
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;

        const stat = await fs.stat(lockPath).catch(() => undefined);
        if (stat && Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          await fs.remove(lockPath);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new ConflictException(
            'A repository update is already in progress. Please retry shortly.',
          );
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }

    try {
      return await operation();
    } finally {
      await fs.remove(lockPath);
    }
  }

  async ask(repoId: string, question: string, audience?: string) {
    if (!question?.trim()) {
      throw new BadRequestException('Question is required');
    }

    const repoPath = await this.initializedRepositoryPath(repoId);
    const retrieval = await this.cliper.searchStructured({
      path: repoPath,
      query: question,
    });
    const answer = await this.aiService.answer(
      question,
      this.enrichCrossFunctionalContext(
        retrieval,
        await this.memories(repoId),
        audience,
      ),
      audience,
    );

    return { repoId, question, audience, answer };
  }

  async recall(repoId: string, query: string, maxResults = 5) {
    if (!query?.trim()) {
      throw new BadRequestException('Query is required');
    }

    const repoPath = await this.initializedRepositoryPath(repoId);
    const retrieval = await this.cliper.searchStructured({
      path: repoPath,
      query,
    });
    const selected = [
      ...retrieval.architecture,
      ...retrieval.files,
      ...retrieval.dependencies,
      ...retrieval.packages,
      ...retrieval.repository,
      ...retrieval.commits,
      ...retrieval.gaps,
    ]
      .filter(
        (memory, index, all) =>
          all.findIndex((candidate) => candidate.id === memory.id) === index,
      )
      .slice(0, maxResults)
      .map((memory) => ({
        memoryId: memory.id,
        type: memory.type,
        title: memory.title,
        content: memory.content,
        relationships: memory.relationships ?? [],
        metadata: memory.metadata ?? {},
      }));

    return {
      repoId,
      query,
      memories: selected,
      summary: selected.length
        ? `Returned ${selected.length} grounded memory item${selected.length === 1 ? '' : 's'} for the coding agent.`
        : 'No matching memory was found. Try a more specific task, component, file, or package name.',
    };
  }

  /**
   * Creates an export of Precure's generated memory only. The cloned source
   * repository and its .git history are deliberately excluded.
   */
  async createMemoryArchive(repoId: string): Promise<Archiver> {
    const repoPath = await this.initializedRepositoryPath(repoId);
    const metadataPath = path.join(repoPath, '.cliper', 'metadata.json');
    const metadata = (await fs.readJson(metadataPath)) as RepositoryMetadata;
    const memoryPath = path.join(
      repoPath,
      '.cliper',
      'memory',
      `cliper-${metadata.projectName}`,
    );

    if (!(await fs.pathExists(memoryPath))) {
      throw new NotFoundException(REPOSITORY_NOT_INITIALIZED);
    }

    const archive = createArchive('zip', { zlib: { level: 9 } });
    archive.file(metadataPath, { name: 'metadata.json' });
    archive.append(
      JSON.stringify(
        {
          format: 'precure-memory-export',
          version: 1,
          repoId,
          description:
            'Generated Precure memory export. It contains indexed memory records and metadata, not repository source code.',
        },
        null,
        2,
      ),
      { name: 'manifest.json' },
    );
    archive.directory(memoryPath, 'memory');
    return archive;
  }

  private enrichCrossFunctionalContext(
    retrieval: SearchResult,
    memories: MemoryObject[],
    audience?: string,
  ): SearchResult {
    const merge = (existing: MemoryObject[], additions: MemoryObject[]) =>
      [...existing, ...additions].filter(
        (memory, index, all) =>
          all.findIndex((candidate) => candidate.id === memory.id) === index,
      );
    const audiencePatterns = this.audiencePatterns(audience);
    const contextualFiles = memories.filter(
      (memory) =>
        memory.type === 'file' &&
        audiencePatterns.test(`${memory.id} ${memory.title}`),
    );
    const contextualArchitecture = memories.filter(
      (memory) =>
        memory.type === 'architecture' &&
        audiencePatterns.test(`${memory.id} ${memory.title}`),
    );
    const contextualDependencies = memories.filter(
      (memory) =>
        memory.type === 'dependency' &&
        audiencePatterns.test(`${memory.id} ${memory.title}`),
    );

    return {
      ...retrieval,
      repository: merge(
        retrieval.repository,
        memories.filter((memory) => memory.type === 'repository'),
      ).slice(0, 4),
      architecture: merge(retrieval.architecture, contextualArchitecture).slice(
        0,
        8,
      ),
      files: merge(retrieval.files, contextualFiles).slice(0, 8),
      dependencies: merge(retrieval.dependencies, contextualDependencies).slice(
        0,
        8,
      ),
      packages: merge(
        retrieval.packages,
        memories.filter((memory) => memory.type === 'package'),
      ).slice(0, 8),
    };
  }

  private audiencePatterns(audience?: string): RegExp {
    switch (audience?.trim().toLowerCase()) {
      case 'devops':
      case 'infrastructure':
      case 'operations':
        return /docker|env|deploy|railway|fly|proxy|payment|x402|main|launch/i;
      case 'hr':
      case 'onboarding':
        return /readme|docs|app\.module|main|repo\.module|mcp\.module|ai\.module/i;
      case 'marketing':
      case 'design':
      case 'product':
      case 'leadership':
        return /readme|about|overview|docs|repo|ai|mcp|payment|launch/i;
      default:
        return /readme|about|overview|package\.json|docs|repo|ai|mcp|payment|main/i;
    }
  }

  async listGaps(repoId: string) {
    const gaps = (await this.memories(repoId))
      .filter((memory) => memory.type === 'gap')
      .sort(
        (left, right) =>
          (SEVERITY_RANK[left.metadata?.severity] ?? 3) -
          (SEVERITY_RANK[right.metadata?.severity] ?? 3),
      );

    return {
      repoId,
      stakeholderSummary: this.gapSummary(gaps),
      gaps,
    };
  }

  async getArchitecture(repoId: string) {
    const memories = await this.memories(repoId);
    const architecture = memories.filter(
      (memory) => memory.type === 'architecture',
    );
    const repository = memories.filter(
      (memory) => memory.type === 'repository',
    );
    return {
      repoId,
      stakeholderSummary: this.architectureSummary(architecture, repository),
      architecture,
      repository,
    };
  }

  async activity(repoId: string) {
    const activity = (await this.memories(repoId))
      .filter((memory) =>
        ['commit', 'release', 'timeline'].includes(memory.type),
      )
      .sort((left, right) => this.compareActivity(left, right));

    return {
      repoId,
      stakeholderSummary: this.activitySummary(activity),
      activity,
    };
  }

  async gapReport(repoId: string) {
    const memories = await this.memories(repoId);
    const gaps = memories
      .filter((memory) => memory.type === 'gap')
      .sort(
        (left, right) =>
          (SEVERITY_RANK[left.metadata?.severity] ?? 3) -
          (SEVERITY_RANK[right.metadata?.severity] ?? 3),
      );
    const dependencies = memories.filter(
      (memory) => memory.type === 'dependency',
    );
    const activity = memories
      .filter((memory) =>
        ['commit', 'release', 'timeline'].includes(memory.type),
      )
      .sort((left, right) => this.compareActivity(left, right));

    return {
      repoId,
      stakeholderSummary: {
        overview: this.reportOverview(gaps, dependencies, activity),
        keyFindings: this.gapSummary(gaps).keyFindings,
        recommendedActions: this.gapSummary(gaps).recommendedActions,
      },
      gaps,
      dependencies,
      activity,
    };
  }

  private gapSummary(gaps: MemoryObject[]) {
    const high = gaps.filter((gap) => gap.metadata?.severity === 'high');
    const medium = gaps.filter((gap) => gap.metadata?.severity === 'medium');
    const low = gaps.filter((gap) => gap.metadata?.severity === 'low');
    const keyFindings = high
      .slice(0, 3)
      .map((gap) => gap.metadata?.description ?? gap.title);

    return {
      overview:
        high.length > 0
          ? `This repository has ${high.length} high-priority issue${high.length === 1 ? '' : 's'} that should be addressed before a production integration, plus ${medium.length} medium- and ${low.length} low-priority documentation or maintenance gap${low.length === 1 ? '' : 's'}.`
          : `No high-priority issues were found in the indexed memory. The repository has ${medium.length} medium- and ${low.length} low-priority documentation or maintenance gap${low.length === 1 ? '' : 's'}.`,
      keyFindings,
      recommendedActions: high.length
        ? [
            'Engineering and DevOps should address high-priority items before production integration.',
            'Product, design, marketing, and HR can use the documentation gaps to identify onboarding and launch-readiness work.',
          ]
        : [
            'Review the listed documentation gaps during normal maintenance and onboarding planning.',
          ],
    };
  }

  private architectureSummary(
    architecture: MemoryObject[],
    repository: MemoryObject[],
  ) {
    const details = repository.find((memory) => memory.metadata?.language) as
      (MemoryObject & { metadata?: RepositoryStatistics }) | undefined;
    const modules = details?.metadata?.modules?.slice(0, 8) ?? [];
    const language =
      details?.metadata?.language ?? 'an unspecified technology stack';
    const fileCount = details?.metadata?.fileCount;

    return {
      overview: `This is a ${language} codebase${fileCount ? ` with ${fileCount} indexed files` : ''}. Its structure is represented by ${architecture.length} component relationship${architecture.length === 1 ? '' : 's'}, so a cross-functional team can understand how the main parts fit together without reading each file.`,
      mainAreas: modules,
      plainEnglish:
        'The architecture records show which parts are responsible for data, payments, AI, and the MCP interface, and how those parts depend on one another. This helps product and design understand feature boundaries, DevOps identify operational components, and marketing or HR prepare accurate launch and onboarding material.',
    };
  }

  private activitySummary(activity: MemoryObject[]) {
    const commits = activity.filter((item) => item.type === 'commit').length;
    const releases = activity.filter((item) => item.type === 'release').length;
    return {
      overview: `The indexed history contains ${commits} recent commit${commits === 1 ? '' : 's'} and ${releases} release${releases === 1 ? '' : 's'}. This helps every stakeholder understand whether the product is actively changing before planning launches, design work, operations, or onboarding.`,
      plainEnglish:
        'Commits are recorded changes to the code. Releases are versioned milestones intended for users or deployment.',
    };
  }

  private reportOverview(
    gaps: MemoryObject[],
    dependencies: MemoryObject[],
    activity: MemoryObject[],
  ): string {
    const high = gaps.filter((gap) => gap.metadata?.severity === 'high').length;
    return `This cross-functional due-diligence summary combines ${gaps.length} known gap${gaps.length === 1 ? '' : 's'}, ${dependencies.length} recorded dependency relationship${dependencies.length === 1 ? '' : 's'}, and ${activity.length} recent activity item${activity.length === 1 ? '' : 's'}. ${high > 0 ? `${high} high-priority issue${high === 1 ? ' needs' : 's need'} engineering and DevOps attention before production integration.` : 'No high-priority issues were found in the indexed memory.'} Product, design, marketing, and HR can use the same evidence to plan scope, messaging, customer expectations, and onboarding.`;
  }

  private compareActivity(left: MemoryObject, right: MemoryObject): number {
    const leftDate = this.memoryDate(left);
    const rightDate = this.memoryDate(right);

    if (leftDate && rightDate) return rightDate.getTime() - leftDate.getTime();
    if (leftDate) return -1;
    if (rightDate) return 1;
    return left.id.localeCompare(right.id);
  }

  private memoryDate(memory: MemoryObject): Date | undefined {
    const candidate =
      memory.metadata?.date ??
      memory.metadata?.publishedAt ??
      memory.metadata?.timestamp ??
      memory.metadata?.createdAt;
    if (typeof candidate !== 'string' && typeof candidate !== 'number')
      return undefined;

    const date = new Date(candidate);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
