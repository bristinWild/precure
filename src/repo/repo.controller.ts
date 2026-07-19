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

  @Get('init')
  initFromQuery(@Query('githubUrl') githubUrl: string) {
    return this.repoService.init(githubUrl);
  }

  @Post('ask')
  askDirect(
    @Body('repoId') bodyRepoId: string,
    @Body('question') bodyQuestion: string,
    @Body('audience') bodyAudience: string | undefined,
    @Query('repoId') queryRepoId: string,
    @Query('question') queryQuestion: string,
    @Query('audience') queryAudience?: string,
  ) {
    return this.repoService.ask(
      bodyRepoId ?? queryRepoId,
      bodyQuestion ?? queryQuestion,
      bodyAudience ?? queryAudience,
    );
  }

  @Get('ask')
  askFromQuery(
    @Query('repoId') repoId: string,
    @Query('question') question: string,
    @Query('audience') audience?: string,
  ) {
    return this.repoService.ask(repoId, question, audience);
  }

  @Post(':repoId/ask')
  ask(
    @Param('repoId') repoId: string,
    @Body('question') question: string,
    @Body('audience') audience?: string,
  ) {
    return this.repoService.ask(repoId, question, audience);
  }

  @Post('sync')
  syncDirect(
    @Body('repoId') bodyRepoId: string,
    @Query('repoId') queryRepoId: string,
  ) {
    return this.repoService.sync(bodyRepoId ?? queryRepoId);
  }

  @Get('sync')
  syncFromQuery(@Query('repoId') repoId: string) {
    return this.repoService.sync(repoId);
  }

  @Post(':repoId/sync')
  sync(@Param('repoId') repoId: string) {
    return this.repoService.sync(repoId);
  }

  @Get(':repoId/gaps')
  listGaps(@Param('repoId') repoId: string) {
    return this.repoService.listGaps(repoId);
  }

  @Get('gaps')
  listGapsDirect(@Query('repoId') repoId: string) {
    return this.repoService.listGaps(repoId);
  }

  @Post('gaps')
  listGapsFromBody(
    @Body('repoId') bodyRepoId: string,
    @Query('repoId') queryRepoId: string,
  ) {
    return this.repoService.listGaps(bodyRepoId ?? queryRepoId);
  }

  @Get(':repoId/gap-report')
  gapReport(@Param('repoId') repoId: string) {
    return this.repoService.gapReport(repoId);
  }

  @Get('report')
  gapReportDirect(@Query('repoId') repoId: string) {
    return this.repoService.gapReport(repoId);
  }

  @Post('report')
  gapReportFromBody(
    @Body('repoId') bodyRepoId: string,
    @Query('repoId') queryRepoId: string,
  ) {
    return this.repoService.gapReport(bodyRepoId ?? queryRepoId);
  }

  @Get(':repoId/architecture')
  getArchitecture(@Param('repoId') repoId: string) {
    return this.repoService.getArchitecture(repoId);
  }

  @Get('architecture')
  getArchitectureDirect(@Query('repoId') repoId: string) {
    return this.repoService.getArchitecture(repoId);
  }

  @Post('architecture')
  getArchitectureFromBody(
    @Body('repoId') bodyRepoId: string,
    @Query('repoId') queryRepoId: string,
  ) {
    return this.repoService.getArchitecture(bodyRepoId ?? queryRepoId);
  }

  @Get(':repoId/activity')
  activity(@Param('repoId') repoId: string) {
    return this.repoService.activity(repoId);
  }

  @Get('activity')
  activityDirect(@Query('repoId') repoId: string) {
    return this.repoService.activity(repoId);
  }

  @Post('activity')
  activityFromBody(
    @Body('repoId') bodyRepoId: string,
    @Query('repoId') queryRepoId: string,
  ) {
    return this.repoService.activity(bodyRepoId ?? queryRepoId);
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

  @Post('memory/download')
  async downloadMemoryFromBody(
    @Body('repoId') bodyRepoId: string,
    @Query('repoId') queryRepoId: string,
    @Res() response: Response,
  ): Promise<void> {
    return this.downloadMemory(bodyRepoId ?? queryRepoId, response);
  }
}
