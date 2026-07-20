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
  private readonly vibeMemoryTransports: TransportMap = {};

  constructor(private readonly repos: RepoService) {}

  async handle(request: Request, response: Response): Promise<void> {
    return this.handleServer(request, response, this.transports, () =>
      this.createServer(),
    );
  }

  async handleVibeMemory(request: Request, response: Response): Promise<void> {
    return this.handleServer(request, response, this.vibeMemoryTransports, () =>
      this.createVibeMemoryServer(),
    );
  }

  async recall(repoId: string, query: string, maxResults?: number) {
    return this.repos.recall(repoId, query, maxResults);
  }

  private async handleServer(
    request: Request,
    response: Response,
    transports: TransportMap,
    createServer: () => McpServer,
  ): Promise<void> {
    const sessionId = request.header('mcp-session-id');

    try {
      this.ensurePostAcceptHeader(request);

      // OKX.AI performs a paid endpoint replay before it has established an
      // MCP session. Return a small, immediately readable capability document
      // for that bare GET/POST probe. Real MCP initialize requests and all
      // session-bound traffic continue through the standard transport below.
      if (!sessionId && this.isCapabilityProbe(request)) {
        response.status(200).json(this.capabilityDocument(request.path));
        return;
      }

      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(
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
            transports[id] = transport;
          },
        });
        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) delete transports[id];
        };

        await createServer().connect(transport);
        await transport.handleRequest(request, response, request.body);
        return;
      }

      response.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or missing MCP session ID.',
        },
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

  private isCapabilityProbe(request: Request): boolean {
    if (request.method === 'GET' || request.method === 'HEAD') return true;
    if (request.method !== 'POST') return false;

    const body: unknown = request.body;
    return (
      body === undefined ||
      body === null ||
      (typeof body === 'object' &&
        !Array.isArray(body) &&
        Object.keys(body).length === 0)
    );
  }

  private ensurePostAcceptHeader(request: Request): void {
    if (request.method !== 'POST') return;

    const accept = request.header('accept')?.toLowerCase() ?? '';
    if (
      !accept.includes('application/json') ||
      !accept.includes('text/event-stream')
    ) {
      const value = 'application/json, text/event-stream';
      request.headers.accept = value;

      // The MCP SDK's Node adapter rebuilds its Web Request from rawHeaders,
      // so keep that source in sync with Express's normalized header map.
      const rawIndex = request.rawHeaders.findIndex(
        (header, index) => index % 2 === 0 && header.toLowerCase() === 'accept',
      );
      if (rawIndex >= 0) request.rawHeaders[rawIndex + 1] = value;
      else request.rawHeaders.push('Accept', value);
    }
  }

  private capabilityDocument(path: string) {
    const vibeMemory = path.includes('vibememory');
    return {
      ok: true,
      status: 'ready',
      service: vibeMemory ? 'Precure VibeMemory' : 'Precure',
      protocol: 'MCP Streamable HTTP',
      endpoint: path,
      usage: {
        initialize:
          'POST a standard MCP initialize request, then retain the mcp-session-id response header.',
        invoke:
          'Use MCP tools/list and tools/call with the retained mcp-session-id.',
      },
      tools: vibeMemory
        ? ['recall']
        : [
            'init_repo',
            'ask',
            'sync_repo',
            'list_gaps',
            'gap_report',
            'get_architecture',
            'activity',
          ],
    };
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
          'Answer a repository question from retrieved memories, tailored for a technical or cross-functional audience.',
        inputSchema: {
          repoId: z.string().optional(),
          // Kept temporarily for clients that adopted the original MCP schema.
          repo: z.string().optional(),
          question: z.string().min(1),
          audience: z.string().max(100).optional(),
        },
      },
      async ({ repoId, repo, question, audience }) =>
        this.result(() =>
          this.repos.ask(this.requireRepoId(repoId, repo), question, audience),
        ),
    );
    server.registerTool(
      'sync_repo',
      {
        description:
          'Update an initialized public repository from its remote branch and refresh its persistent memory.',
        inputSchema: {
          repoId: z.string().optional(),
          repo: z.string().optional(),
        },
      },
      async ({ repoId, repo }) =>
        this.result(() => this.repos.sync(this.requireRepoId(repoId, repo))),
    );
    server.registerTool(
      'list_gaps',
      {
        description:
          'Return a cross-functional summary plus known repository gaps in high, medium, then low severity order.',
        inputSchema: {
          repoId: z.string().optional(),
          repo: z.string().optional(),
        },
      },
      async ({ repoId, repo }) =>
        this.result(() =>
          this.repos.listGaps(this.requireRepoId(repoId, repo)),
        ),
    );
    server.registerTool(
      'gap_report',
      {
        description:
          'Return a cross-functional due-diligence summary plus gaps, dependency information, and activity.',
        inputSchema: {
          repoId: z.string().optional(),
          repo: z.string().optional(),
        },
      },
      async ({ repoId, repo }) =>
        this.result(() =>
          this.repos.gapReport(this.requireRepoId(repoId, repo)),
        ),
    );
    server.registerTool(
      'get_architecture',
      {
        description:
          'Return a cross-functional plain-English architecture overview plus repository memories.',
        inputSchema: {
          repoId: z.string().optional(),
          repo: z.string().optional(),
        },
      },
      async ({ repoId, repo }) =>
        this.result(() =>
          this.repos.getArchitecture(this.requireRepoId(repoId, repo)),
        ),
    );
    server.registerTool(
      'activity',
      {
        description:
          'Return a cross-functional plain-English activity overview plus commits, releases, and timeline memories.',
        inputSchema: {
          repoId: z.string().optional(),
          repo: z.string().optional(),
        },
      },
      async ({ repoId, repo }) =>
        this.result(() =>
          this.repos.activity(this.requireRepoId(repoId, repo)),
        ),
    );

    return server;
  }

  private requireRepoId(repoId?: string, legacyRepo?: string): string {
    const value = repoId ?? legacyRepo;
    if (!value) {
      throw new Error('repoId is required');
    }
    return value;
  }

  private createVibeMemoryServer(): McpServer {
    const server = new McpServer({ name: 'vibememory', version: '0.1.0' });

    server.registerTool(
      'recall',
      {
        description:
          'Return compact, grounded persistent repository memories for a coding agent task without generating an LLM answer.',
        inputSchema: {
          repoId: z.string().optional(),
          // Kept temporarily for clients that adopted the original MCP schema.
          repo: z.string().optional(),
          query: z.string().min(1),
          max_results: z.number().int().min(1).max(8).optional(),
        },
      },
      async ({ repoId, repo, query, max_results }) =>
        this.result(() =>
          this.repos.recall(
            this.requireRepoId(repoId, repo),
            query,
            max_results ?? 5,
          ),
        ),
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
