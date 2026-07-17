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
    const metadataPath = path.join(repoPath, '.cliper', 'metadata.json');
    let cloned = false;

    if (!(await fs.pathExists(path.join(repoPath, '.git')))) {
      await simpleGit().clone(normalizedUrl, repoPath, [
        '--depth',
        '1',
        '--filter=blob:none',
      ]);
      cloned = true;
    }

    const alreadyIndexed = await fs.pathExists(metadataPath);
    if (!alreadyIndexed) {
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

    return { repoId, gaps };
  }

  async getArchitecture(repoId: string) {
    const memories = await this.memories(repoId);
    return {
      repoId,
      architecture: memories.filter((memory) => memory.type === 'architecture'),
      repository: memories.filter((memory) => memory.type === 'repository'),
    };
  }

  async activity(repoId: string) {
    const activity = (await this.memories(repoId))
      .filter((memory) =>
        ['commit', 'release', 'timeline'].includes(memory.type),
      )
      .sort((left, right) => this.compareActivity(left, right));

    return { repoId, activity };
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

    return { repoId, gaps, dependencies, activity };
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
