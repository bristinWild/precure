import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @All()
  handle(@Req() request: Request, @Res() response: Response) {
    return this.mcp.handle(request, response);
  }
}
