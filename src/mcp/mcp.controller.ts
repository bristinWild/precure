import { All, Body, Controller, Post, Req, Res } from '@nestjs/common';
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
    @Body('repoId') repoId: string,
    @Body('query') query: string,
    @Body('maxResults') maxResults?: number,
  ) {
    return this.mcp.recall(repoId, query, maxResults);
  }
}
