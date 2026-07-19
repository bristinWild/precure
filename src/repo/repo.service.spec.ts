jest.mock('cliper-memory', () => ({
  Cliper: class Cliper {},
}));

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { RepoService } from './repo.service';

const REPO_ID =
  'f7079c8596cdebaad8190c418571d187d312174257a40b7115ee78bec3642c42';

describe('RepoService', () => {
  let service: RepoService;
  const originalDownloadSecret = process.env.MEMORY_DOWNLOAD_SECRET;
  const originalDownloadTtl = process.env.MEMORY_DOWNLOAD_URL_TTL_SECONDS;

  beforeEach(async () => {
    process.env.MEMORY_DOWNLOAD_SECRET = 'unit-test-download-secret';
    process.env.MEMORY_DOWNLOAD_URL_TTL_SECONDS = '300';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepoService,
        {
          provide: AiService,
          useValue: { answer: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RepoService>(RepoService);
  });

  afterAll(() => {
    if (originalDownloadSecret === undefined) {
      delete process.env.MEMORY_DOWNLOAD_SECRET;
    } else {
      process.env.MEMORY_DOWNLOAD_SECRET = originalDownloadSecret;
    }
    if (originalDownloadTtl === undefined) {
      delete process.env.MEMORY_DOWNLOAD_URL_TTL_SECONDS;
    } else {
      process.env.MEMORY_DOWNLOAD_URL_TTL_SECONDS = originalDownloadTtl;
    }
  });

  it('rejects malformed repository IDs', async () => {
    await expect(service.listGaps('../not-a-repo')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns the initialization guidance for an unknown repository', async () => {
    await expect(service.listGaps('a'.repeat(64))).rejects.toMatchObject({
      response: {
        message: 'Repository memory is not initialized; run cliper init first.',
      },
    } as NotFoundException);
  });

  it('orders gaps by severity', async () => {
    const { gaps, stakeholderSummary } = await service.listGaps(REPO_ID);
    const severity = gaps.map((gap) => gap.metadata.severity);
    const firstMedium = severity.indexOf('medium');
    const firstLow = severity.indexOf('low');

    expect(gaps.length).toBeGreaterThan(0);
    expect(
      firstMedium === -1 || firstMedium >= severity.lastIndexOf('high'),
    ).toBe(true);
    expect(firstLow === -1 || firstLow >= severity.lastIndexOf('medium')).toBe(
      true,
    );
    expect(stakeholderSummary.overview).toEqual(expect.any(String));
  });

  it('returns the four memory groups used by a gap report', async () => {
    await expect(service.gapReport(REPO_ID)).resolves.toEqual(
      expect.objectContaining({
        repoId: REPO_ID,
        stakeholderSummary: expect.objectContaining({
          overview: expect.any(String),
          keyFindings: expect.any(Array),
          recommendedActions: expect.any(Array),
        }),
        gaps: expect.any(Array),
        dependencies: expect.any(Array),
        activity: expect.any(Array),
      }),
    );
  });

  it('creates and verifies a short-lived memory download link', async () => {
    const download = await service.createMemoryDownloadLink(
      REPO_ID,
      'https://precure.example/',
    );
    const url = new URL(download.downloadUrl);
    const token = url.searchParams.get('token');

    expect(download).toEqual(
      expect.objectContaining({
        success: true,
        repoId: REPO_ID,
        filename: `precure-memory-${REPO_ID}.zip`,
        mimeType: 'application/zip',
        expiresAt: expect.any(String),
      }),
    );
    expect(url.origin).toBe('https://precure.example');
    expect(url.pathname).toBe('/repo/memory/file');
    expect(token).toEqual(expect.any(String));
    expect(service.verifyMemoryDownloadToken(token!)).toBe(REPO_ID);
  });

  it('rejects tampered or expired memory download links', async () => {
    const now = Date.now();
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
    const download = await service.createMemoryDownloadLink(
      REPO_ID,
      'https://precure.example',
    );
    const token = new URL(download.downloadUrl).searchParams.get('token')!;

    expect(() => service.verifyMemoryDownloadToken(`${token}x`)).toThrow(
      UnauthorizedException,
    );
    dateNow.mockReturnValue(now + 301_000);
    expect(() => service.verifyMemoryDownloadToken(token)).toThrow(
      UnauthorizedException,
    );
    dateNow.mockRestore();
  });
});
