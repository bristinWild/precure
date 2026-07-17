import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs-extra';
import simpleGit from 'simple-git';
import { Cliper } from 'cliper-memory';
import {
  loadConfig,
  saveConfig,
} from 'cliper-memory/dist/config/config';
import type { MemoryObject } from 'cliper-memory/dist/sdk/memory/memory';
import { AiService } from '../ai/ai.service';

const REPOSITORY_NOT_INITIALIZED =
  'Repository memory is not initialized; run cliper init first.';

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
  }

  async ask(repoId: string, question: string) {
    if (!question?.trim()) {
      throw new BadRequestException('Question is required');
    }

    const repoPath = await this.initializedRepositoryPath(repoId);
    const retrieval = await this.cliper.searchStructured({
      path: repoPath,
      query: question,
    });
    const answer = await this.aiService.answer(question, retrieval);

    return { repoId, question, answer };
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
      managerSummary: this.gapSummary(gaps),
      gaps,
    };
  }

  async getArchitecture(repoId: string) {
    const memories = await this.memories(repoId);
    const architecture = memories.filter((memory) => memory.type === 'architecture');
    const repository = memories.filter((memory) => memory.type === 'repository');
    return {
      repoId,
      managerSummary: this.architectureSummary(architecture, repository),
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
      managerSummary: this.activitySummary(activity),
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
      executiveSummary: {
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
    const keyFindings = high.slice(0, 3).map((gap) => gap.metadata?.description ?? gap.title);

    return {
      overview:
        high.length > 0
          ? `This repository has ${high.length} high-priority issue${high.length === 1 ? '' : 's'} that should be addressed before a production integration, plus ${medium.length} medium- and ${low.length} low-priority documentation or maintenance gap${low.length === 1 ? '' : 's'}.`
          : `No high-priority issues were found in the indexed memory. The repository has ${medium.length} medium- and ${low.length} low-priority documentation or maintenance gap${low.length === 1 ? '' : 's'}.`,
      keyFindings,
      recommendedActions: high.length
        ? ['Address the high-priority items before production integration.', 'Assign owners and target dates for the remaining documentation gaps.']
        : ['Review the listed documentation gaps during normal maintenance.'],
    };
  }

  private architectureSummary(
    architecture: MemoryObject[],
    repository: MemoryObject[],
  ) {
    const details = repository.find((memory) => memory.metadata?.language) as
      | (MemoryObject & { metadata?: RepositoryStatistics })
      | undefined;
    const modules = details?.metadata?.modules?.slice(0, 8) ?? [];
    const language = details?.metadata?.language ?? 'an unspecified technology stack';
    const fileCount = details?.metadata?.fileCount;

    return {
      overview: `This is a ${language} codebase${fileCount ? ` with ${fileCount} indexed files` : ''}. Its structure is represented by ${architecture.length} component relationship${architecture.length === 1 ? '' : 's'}, so managers can see how the main parts fit together without reading each file.`,
      mainAreas: modules,
      plainEnglish: 'The architecture records show which parts of the application are responsible for data, payments, AI, and the MCP interface, and how those parts depend on one another.',
    };
  }

  private activitySummary(activity: MemoryObject[]) {
    const commits = activity.filter((item) => item.type === 'commit').length;
    const releases = activity.filter((item) => item.type === 'release').length;
    return {
      overview: `The indexed history contains ${commits} recent commit${commits === 1 ? '' : 's'} and ${releases} release${releases === 1 ? '' : 's'}. This helps a manager judge whether the project is actively changing before depending on it.`,
      plainEnglish: 'Commits are recorded changes to the code. Releases are versioned milestones intended for users or deployment.',
    };
  }

  private reportOverview(
    gaps: MemoryObject[],
    dependencies: MemoryObject[],
    activity: MemoryObject[],
  ): string {
    const high = gaps.filter((gap) => gap.metadata?.severity === 'high').length;
    return `This due-diligence summary combines ${gaps.length} known gap${gaps.length === 1 ? '' : 's'}, ${dependencies.length} recorded dependency relationship${dependencies.length === 1 ? '' : 's'}, and ${activity.length} recent activity item${activity.length === 1 ? '' : 's'}. ${high > 0 ? `${high} high-priority issue${high === 1 ? ' needs' : 's need'} management attention before production integration.` : 'No high-priority issues were found in the indexed memory.'}`;
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
