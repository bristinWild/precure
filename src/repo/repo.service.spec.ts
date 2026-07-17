jest.mock('cliper-memory', () => ({
  Cliper: class Cliper {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { RepoService } from './repo.service';

const REPO_ID =
  'f7079c8596cdebaad8190c418571d187d312174257a40b7115ee78bec3642c42';

describe('RepoService', () => {
  let service: RepoService;

  beforeEach(async () => {
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
    const { gaps, managerSummary } = await service.listGaps(REPO_ID);
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
    expect(managerSummary.overview).toEqual(expect.any(String));
  });

  it('returns the four memory groups used by a gap report', async () => {
    await expect(service.gapReport(REPO_ID)).resolves.toEqual(
      expect.objectContaining({
        repoId: REPO_ID,
        executiveSummary: expect.objectContaining({
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
});
