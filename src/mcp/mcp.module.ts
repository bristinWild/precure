import { Module } from '@nestjs/common';
import { RepoModule } from '../repo/repo.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [RepoModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
