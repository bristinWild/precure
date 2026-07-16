import { Module } from '@nestjs/common';
import { RepoModule } from './repo/repo.module';
import { AiModule } from './ai/ai.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [RepoModule, AiModule, McpModule],
})
export class AppModule {}
