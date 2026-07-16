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
    ask: jest.fn(),
    listGaps: jest.fn(),
    gapReport: jest.fn(),
    getArchitecture: jest.fn(),
    activity: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RepoController],
      providers: [{ provide: RepoService, useValue: repoService }],
    }).compile();

    controller = module.get<RepoController>(RepoController);
  });

  it('exposes the six repository operations', () => {
    expect(controller).toBeDefined();
    expect(typeof controller.init).toBe('function');
    expect(typeof controller.ask).toBe('function');
    expect(typeof controller.listGaps).toBe('function');
    expect(typeof controller.gapReport).toBe('function');
    expect(typeof controller.getArchitecture).toBe('function');
    expect(typeof controller.activity).toBe('function');
  });
});
