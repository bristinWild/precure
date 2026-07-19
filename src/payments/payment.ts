import { paymentMiddleware, x402ResourceServer } from '@okxweb3/x402-express';
import { OKXFacilitatorClient } from '@okxweb3/x402-core';
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server';
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from '@x402/extensions/bazaar';
import type { Express, NextFunction, Request, Response } from 'express';

const NETWORK = 'eip155:196' as const;

const PRICES = {
  init: '$0.25',
  sync: '$0.25',
  ask: '$0.25',
  gaps: '$0.25',
  gapReport: '$0.25',
  architecture: '$0.25',
  activity: '$0.25',
  memoryDownload: '$4.00',
  mcp: '$0.25',
  vibeMemory: '$0.05',
} as const;

type FreeTierEntry = { calls: number; resetAt: number };

export function createFreeTierMiddleware(limit: number) {
  const callers = new Map<string, FreeTierEntry>();

  return (request: Request, _response: Response, next: NextFunction) => {
    if (limit <= 0) return next();

    const caller =
      request.header('x-precure-caller') ?? request.ip ?? 'anonymous-caller';
    const now = Date.now();
    const entry = callers.get(caller);
    const current =
      !entry || entry.resetAt <= now
        ? { calls: 0, resetAt: now + 24 * 60 * 60 * 1000 }
        : entry;

    if (current.calls < limit) {
      current.calls += 1;
      callers.set(caller, current);
      return next();
    }

    return next();
  };
}

export function configurePayments(express: Express): void {
  if (process.env.PRECURE_PAYMENT_MODE !== 'x402') return;

  const { OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, PAY_TO_ADDRESS } =
    process.env;
  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE || !PAY_TO_ADDRESS) {
    throw new Error(
      'x402 mode requires OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, and PAY_TO_ADDRESS.',
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(PAY_TO_ADDRESS)) {
    throw new Error(
      'PAY_TO_ADDRESS must be a 0x-prefixed EVM address for X Layer payments.',
    );
  }

  const freeCalls = Number.parseInt(process.env.FREE_CALLS_PER_DAY ?? '3', 10);
  const facilitator = new OKXFacilitatorClient({
    apiKey: OKX_API_KEY,
    secretKey: OKX_SECRET_KEY,
    passphrase: OKX_PASSPHRASE,
    syncSettle: true,
  });
  const resourceServer = new x402ResourceServer(facilitator).register(
    NETWORK,
    new ExactEvmScheme(),
  );
  // Include standard x402 v2 discovery metadata in each challenge.  This tells
  // payment clients how to preserve a service's input when replaying the paid
  // request, rather than leaving a POST body or GET query empty after signing.
  resourceServer.registerExtension(bazaarResourceServerExtension as never);

  express.use(
    createFreeTierMiddleware(Number.isNaN(freeCalls) ? 3 : freeCalls),
  );
  express.use(
    paymentMiddleware(
      {
        'POST /repo/init': route(
          PRICES.init,
          'Initialize a repository memory graph',
          postInput(
            { githubUrl: 'https://github.com/owner/repository' },
            objectSchema(
              {
                githubUrl: stringField('Public GitHub repository URL.'),
              },
              ['githubUrl'],
            ),
          ),
        ),
        'GET /repo/init': route(
          PRICES.init,
          'Initialize a repository memory graph',
          githubUrlQueryInput(),
        ),
        'POST /repo/:repoId/ask': route(
          PRICES.ask,
          'Answer a repository question',
        ),
        'POST /repo/ask': route(
          PRICES.ask,
          'Answer a repository question',
          postInput(
            {
              repoId: 'repository-id-from-repo-memory-indexer',
              question: 'What is this project and who is it for?',
              audience: 'product',
            },
            objectSchema(
              {
                repoId: stringField(
                  'Repository ID returned by Repo Memory Indexer.',
                ),
                question: stringField(
                  'Plain-language question about the repository.',
                ),
                audience: stringField(
                  'Optional audience, such as product, devops, marketing, design, or HR.',
                ),
              },
              ['repoId', 'question'],
            ),
          ),
        ),
        'GET /repo/ask': route(
          PRICES.ask,
          'Answer a repository question',
          askQueryInput(),
        ),
        'POST /repo/:repoId/sync': route(
          PRICES.sync,
          'Synchronize a repository and refresh its persistent memory',
        ),
        'POST /repo/sync': route(
          PRICES.sync,
          'Synchronize a repository and refresh its persistent memory',
          postInput(
            { repoId: 'repository-id-from-repo-memory-indexer' },
            repoIdBodySchema(),
          ),
        ),
        'GET /repo/sync': route(
          PRICES.sync,
          'Synchronize a repository and refresh its persistent memory',
          repoIdQueryInput(),
        ),
        'GET /repo/:repoId/gaps': route(
          PRICES.gaps,
          'List repository risk gaps',
        ),
        'GET /repo/gaps': route(
          PRICES.gaps,
          'List repository risk gaps',
          repoIdQueryInput(),
        ),
        'POST /repo/gaps': route(
          PRICES.gaps,
          'List repository risk gaps',
          postInput(
            { repoId: 'repository-id-from-repo-memory-indexer' },
            repoIdBodySchema(),
          ),
        ),
        'GET /repo/:repoId/gap-report': route(
          PRICES.gapReport,
          'Generate a structured repository risk report',
        ),
        'GET /repo/report': route(
          PRICES.gapReport,
          'Generate a structured repository risk report',
          repoIdQueryInput(),
        ),
        'POST /repo/report': route(
          PRICES.gapReport,
          'Generate a structured repository risk report',
          postInput(
            { repoId: 'repository-id-from-repo-memory-indexer' },
            repoIdBodySchema(),
          ),
        ),
        'GET /repo/:repoId/architecture': route(
          PRICES.architecture,
          'Retrieve the repository architecture',
        ),
        'GET /repo/architecture': route(
          PRICES.architecture,
          'Retrieve the repository architecture',
          repoIdQueryInput(),
        ),
        'POST /repo/architecture': route(
          PRICES.architecture,
          'Retrieve the repository architecture',
          postInput(
            { repoId: 'repository-id-from-repo-memory-indexer' },
            repoIdBodySchema(),
          ),
        ),
        'GET /repo/:repoId/activity': route(
          PRICES.activity,
          'Retrieve repository activity and releases',
        ),
        'GET /repo/activity': route(
          PRICES.activity,
          'Retrieve repository activity and releases',
          repoIdQueryInput(),
        ),
        'POST /repo/activity': route(
          PRICES.activity,
          'Retrieve repository activity and releases',
          postInput(
            { repoId: 'repository-id-from-repo-memory-indexer' },
            repoIdBodySchema(),
          ),
        ),
        'GET /repo/:repoId/memory.zip': route(
          PRICES.memoryDownload,
          'Download a complete Precure repository memory export',
          undefined,
          'application/zip',
        ),
        'GET /repo/memory/download': route(
          PRICES.memoryDownload,
          'Create a secure link for a complete Precure repository memory export',
          repoIdQueryInput(memoryDownloadOutputExample()),
        ),
        'POST /repo/memory/download': route(
          PRICES.memoryDownload,
          'Create a secure link for a complete Precure repository memory export',
          postInput(
            { repoId: 'repository-id-from-repo-memory-indexer' },
            repoIdBodySchema(),
            memoryDownloadOutputExample(),
          ),
        ),
        'GET /mcp': route(PRICES.mcp, 'Open or resume a Precure MCP session'),
        'POST /mcp': route(PRICES.mcp, 'Call a Precure MCP tool'),
        'GET /vibememory/mcp': route(
          PRICES.vibeMemory,
          'Open or resume a VibeMemory MCP session',
        ),
        'POST /vibememory/mcp': route(
          PRICES.vibeMemory,
          'Recall persistent repository memory for a coding agent',
        ),
        'POST /vibememory/recall': route(
          PRICES.vibeMemory,
          'Recall persistent repository memory for a coding agent',
          postInput(
            {
              repoId: 'repository-id-from-repo-memory-indexer',
              query: 'Where is payment middleware configured?',
              maxResults: 5,
            },
            objectSchema(
              {
                repoId: stringField(
                  'Repository ID returned by Repo Memory Indexer.',
                ),
                query: stringField(
                  'Coding-task query to recall from persistent memory.',
                ),
                maxResults: {
                  type: 'number',
                  description:
                    'Optional maximum number of memory records to return.',
                },
              },
              ['repoId', 'query'],
            ),
          ),
        ),
        'GET /vibememory/recall': route(
          PRICES.vibeMemory,
          'Recall persistent repository memory for a coding agent',
          vibeMemoryQueryInput(),
        ),
      },
      resourceServer,
    ),
  );
}

function route(
  price: string,
  description: string,
  extensions?: Record<string, unknown>,
  mimeType = 'application/json',
) {
  return {
    accepts: [
      {
        scheme: 'exact' as const,
        network: NETWORK,
        payTo: process.env.PAY_TO_ADDRESS!,
        price,
      },
    ],
    description,
    mimeType,
    ...(extensions ? { extensions } : {}),
  };
}

function stringField(description: string) {
  return { type: 'string', description };
}

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function postInput(
  input: Record<string, unknown>,
  inputSchema: Record<string, unknown>,
  outputExample: Record<string, unknown> = { ok: true },
) {
  return declareDiscoveryExtension({
    bodyType: 'json',
    input,
    inputSchema,
    output: {
      example: outputExample,
    },
  }) as Record<string, unknown>;
}

function repoIdBodySchema() {
  return objectSchema(
    {
      repoId: stringField('Repository ID returned by Repo Memory Indexer.'),
    },
    ['repoId'],
  );
}

function githubUrlQueryInput() {
  return declareDiscoveryExtension({
    input: {
      githubUrl: 'https://github.com/owner/repository',
    },
    inputSchema: objectSchema(
      { githubUrl: stringField('Public GitHub repository URL.') },
      ['githubUrl'],
    ),
    output: { example: { ok: true } },
  }) as Record<string, unknown>;
}

function askQueryInput() {
  return declareDiscoveryExtension({
    input: {
      repoId: 'repository-id-from-repo-memory-indexer',
      question: 'What is this project and who is it for?',
      audience: 'product',
    },
    inputSchema: objectSchema(
      {
        repoId: stringField('Repository ID returned by Repo Memory Indexer.'),
        question: stringField('Plain-language question about the repository.'),
        audience: stringField(
          'Optional audience, such as product, devops, marketing, design, or HR.',
        ),
      },
      ['repoId', 'question'],
    ),
    output: { example: { ok: true } },
  }) as Record<string, unknown>;
}

function vibeMemoryQueryInput() {
  return declareDiscoveryExtension({
    input: {
      repoId: 'repository-id-from-repo-memory-indexer',
      query: 'Where is payment middleware configured?',
      maxResults: 5,
    },
    inputSchema: objectSchema(
      {
        repoId: stringField('Repository ID returned by Repo Memory Indexer.'),
        query: stringField(
          'Coding-task query to recall from persistent memory.',
        ),
        maxResults: {
          type: 'number',
          description: 'Optional maximum number of memory records to return.',
        },
      },
      ['repoId', 'query'],
    ),
    output: { example: { ok: true } },
  }) as Record<string, unknown>;
}

function repoIdQueryInput(
  outputExample: Record<string, unknown> = { ok: true },
) {
  return declareDiscoveryExtension({
    input: { repoId: 'repository-id-from-repo-memory-indexer' },
    inputSchema: repoIdBodySchema(),
    output: {
      example: outputExample,
    },
  }) as Record<string, unknown>;
}

function memoryDownloadOutputExample() {
  return {
    success: true,
    repoId: 'repository-id-from-repo-memory-indexer',
    filename: 'precure-memory-repository-id.zip',
    mimeType: 'application/zip',
    downloadUrl:
      'https://precure-production.up.railway.app/repo/memory/file?token=signed-short-lived-token',
    expiresAt: '2026-07-19T12:00:00.000Z',
    instructions: 'Open downloadUrl before expiresAt to download the ZIP.',
  };
}
