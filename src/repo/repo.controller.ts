import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RepoService } from './repo.service';

@Controller('repo')
export class RepoController {
  constructor(private readonly repoService: RepoService) {}

  @Post('init')
  init(@Body('githubUrl') githubUrl: string) {
    return this.repoService.init(githubUrl);
  }

  @Post(':repoId/ask')
  ask(@Param('repoId') repoId: string, @Body('question') question: string) {
    return this.repoService.ask(repoId, question);
  }

  @Post(':repoId/sync')
  sync(@Param('repoId') repoId: string) {
    return this.repoService.sync(repoId);
  }

  @Get(':repoId/gaps')
  listGaps(@Param('repoId') repoId: string) {
    return this.repoService.listGaps(repoId);
  }

  @Get(':repoId/gap-report')
  gapReport(@Param('repoId') repoId: string) {
    return this.repoService.gapReport(repoId);
  }

  @Get(':repoId/architecture')
  getArchitecture(@Param('repoId') repoId: string) {
    return this.repoService.getArchitecture(repoId);
  }

  @Get(':repoId/activity')
  activity(@Param('repoId') repoId: string) {
    return this.repoService.activity(repoId);
  }

  @Get(':repoId/memory.zip')
  async downloadMemory(
    @Param('repoId') repoId: string,
    @Res() response: Response,
  ): Promise<void> {
    const archive = await this.repoService.createMemoryArchive(repoId);
    response.status(200);
    response.setHeader('content-type', 'application/zip');
    response.setHeader(
      'content-disposition',
      `attachment; filename="precure-memory-${repoId}.zip"`,
    );
    archive.on('error', (error) => response.destroy(error));
    archive.pipe(response);
    await archive.finalize();
  }

  @Get('memory/download')
  async downloadMemoryFromQuery(
    @Query('repoId') repoId: string,
    @Res() response: Response,
  ): Promise<void> {
    return this.downloadMemory(repoId, response);
  }
}
