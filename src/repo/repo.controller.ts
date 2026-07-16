import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
}
