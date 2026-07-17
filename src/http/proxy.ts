import type { Express } from 'express';

/**
 * Railway terminates TLS before forwarding requests to the application. Trust
 * exactly that proxy hop so Express exposes the public HTTPS scheme to the
 * x402 middleware when it constructs a payment challenge.
 */
export function configureProxyTrust(app: Express): void {
  app.set('trust proxy', 1);
}
