jest.mock('cliper-memory', () => ({
  Cliper: class Cliper {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { RepoController } from './repo.controller';
import { RepoService } from './repo.service';

describe('RepoController', () => {
  let controller: RepoController;
  const repoService = {
    init: jest.fn(),
    sync: jest.fn(),
    ask: jest.fn(),
    listGaps: jest.fn(),
    gapReport: jest.fn(),
    getArchitecture: jest.fn(),
    activity: jest.fn(),
    createMemoryArchive: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RepoController],
      providers: [{ provide: RepoService, useValue: repoService }],
    }).compile();

    controller = module.get<RepoController>(RepoController);
  });

  it('exposes direct API routes alongside the legacy repository routes', () => {
    expect(controller).toBeDefined();
    expect(typeof controller.init).toBe('function');
    expect(typeof controller.initFromQuery).toBe('function');
    expect(typeof controller.sync).toBe('function');
    expect(typeof controller.ask).toBe('function');
    expect(typeof controller.listGaps).toBe('function');
    expect(typeof controller.gapReport).toBe('function');
    expect(typeof controller.getArchitecture).toBe('function');
    expect(typeof controller.activity).toBe('function');
    expect(typeof controller.downloadMemory).toBe('function');
    expect(typeof controller.askDirect).toBe('function');
    expect(typeof controller.askFromQuery).toBe('function');
    expect(typeof controller.syncDirect).toBe('function');
    expect(typeof controller.syncFromQuery).toBe('function');
    expect(typeof controller.listGapsDirect).toBe('function');
    expect(typeof controller.gapReportDirect).toBe('function');
    expect(typeof controller.getArchitectureDirect).toBe('function');
    expect(typeof controller.activityDirect).toBe('function');
  });
});
