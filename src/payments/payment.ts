import { paymentMiddleware, x402ResourceServer } from '@okxweb3/x402-express';
import { OKXFacilitatorClient } from '@okxweb3/x402-core';
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server';
import type { Express, NextFunction, Request, Response } from 'express';

const NETWORK = 'eip155:196' as const;

const PRICES = {
  init: '$0.50',
  sync: '$0.25',
  ask: '$0.02',
  gaps: '$0.10',
  gapReport: '$0.25',
  architecture: '$0.05',
  activity: '$0.02',
  memoryDownload: '$5.00',
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

  express.use(
    createFreeTierMiddleware(Number.isNaN(freeCalls) ? 3 : freeCalls),
  );
  express.use(
    paymentMiddleware(
      {
        'POST /repo/init': route(
          PRICES.init,
          'Initialize a repository memory graph',
        ),
        'POST /repo/:repoId/ask': route(
          PRICES.ask,
          'Answer a repository question',
        ),
        'POST /repo/:repoId/sync': route(
          PRICES.sync,
          'Synchronize a repository and refresh its persistent memory',
        ),
        'GET /repo/:repoId/gaps': route(
          PRICES.gaps,
          'List repository risk gaps',
        ),
        'GET /repo/:repoId/gap-report': route(
          PRICES.gapReport,
          'Generate a structured repository risk report',
        ),
        'GET /repo/:repoId/architecture': route(
          PRICES.architecture,
          'Retrieve the repository architecture',
        ),
        'GET /repo/:repoId/activity': route(
          PRICES.activity,
          'Retrieve repository activity and releases',
        ),
        'GET /repo/:repoId/memory.zip': route(
          PRICES.memoryDownload,
          'Download a complete Precure repository memory export',
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
      },
      resourceServer,
    ),
  );
}

function route(price: string, description: string) {
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
    mimeType: 'application/json',
  };
}
