import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { RepoService } from '../repo/repo.service';

type TransportMap = Record<string, StreamableHTTPServerTransport>;

@Injectable()
export class McpService {
  private readonly transports: TransportMap = {};

  constructor(private readonly repos: RepoService) {}

  async handle(request: Request, response: Response): Promise<void> {
    const sessionId = request.header('mcp-session-id');

    try {
      if (sessionId && this.transports[sessionId]) {
        await this.transports[sessionId].handleRequest(
          request,
          response,
          request.body,
        );
        return;
      }

      if (
        !sessionId &&
        request.method === 'POST' &&
        isInitializeRequest(request.body)
      ) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: (id) => {
            this.transports[id] = transport;
          },
        });
        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) delete this.transports[id];
        };

        await this.createServer().connect(transport);
        await transport.handleRequest(request, response, request.body);
        return;
      }

      response.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing MCP session ID.' },
        id: null,
      });
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP server error.' },
          id: null,
        });
      }
      console.error('MCP request failed', error);
    }
  }

  private createServer(): McpServer {
    const server = new McpServer({ name: 'precure', version: '0.1.0' });

    server.registerTool(
      'init_repo',
      {
        description:
          'Clone and build a persistent memory graph for a public GitHub repository.',
        inputSchema: { github_url: z.string().url() },
      },
      async ({ github_url }) => this.result(() => this.repos.init(github_url)),
    );
    server.registerTool(
      'ask',
      {
        description:
          'Answer a repository question only from retrieved repository memories.',
        inputSchema: { repo: z.string(), question: z.string().min(1) },
      },
      async ({ repo, question }) =>
        this.result(() => this.repos.ask(repo, question)),
    );
    server.registerTool(
      'list_gaps',
      {
        description:
          'Return known repository gaps in high, medium, then low severity order.',
        inputSchema: { repo: z.string() },
      },
      async ({ repo }) => this.result(() => this.repos.listGaps(repo)),
    );
    server.registerTool(
      'gap_report',
      {
        description:
          'Return gaps, dependency risk, and activity as a structured report.',
        inputSchema: { repo: z.string() },
      },
      async ({ repo }) => this.result(() => this.repos.gapReport(repo)),
    );
    server.registerTool(
      'get_architecture',
      {
        description:
          'Return the repository architecture and repository memories.',
        inputSchema: { repo: z.string() },
      },
      async ({ repo }) => this.result(() => this.repos.getArchitecture(repo)),
    );
    server.registerTool(
      'activity',
      {
        description:
          'Return commits, releases, and timeline memories with dated items first.',
        inputSchema: { repo: z.string() },
      },
      async ({ repo }) => this.result(() => this.repos.activity(repo)),
    );

    return server;
  }

  private async result(operation: () => Promise<unknown>) {
    try {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(await operation()) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : 'Tool failed.',
          },
        ],
        isError: true,
      };
    }
  }
}
