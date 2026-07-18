import { All, Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';

@Controller()
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @All('mcp')
  handle(@Req() request: Request, @Res() response: Response) {
    return this.mcp.handle(request, response);
  }

  @All('vibememory/mcp')
  handleVibeMemory(@Req() request: Request, @Res() response: Response) {
    return this.mcp.handleVibeMemory(request, response);
  }

  @Post('vibememory/recall')
  recallVibeMemory(
    @Body('repoId') bodyRepoId: string,
    @Body('query') bodyQuery: string,
    @Body('maxResults') bodyMaxResults: number | undefined,
    @Query('repoId') queryRepoId: string,
    @Query('query') queryQuery: string,
    @Query('maxResults') queryMaxResults?: string,
  ) {
    const maxResults = bodyMaxResults ?? (queryMaxResults ? Number(queryMaxResults) : undefined);
    return this.mcp.recall(bodyRepoId ?? queryRepoId, bodyQuery ?? queryQuery, maxResults);
  }

  @Get('vibememory/recall')
  recallVibeMemoryFromQuery(
    @Query('repoId') repoId: string,
    @Query('query') query: string,
    @Query('maxResults') maxResults?: string,
  ) {
    return this.mcp.recall(repoId, query, maxResults ? Number(maxResults) : undefined);
  }
}
