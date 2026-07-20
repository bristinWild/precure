jest.mock('cliper-memory', () => ({
  Cliper: class Cliper {},
}));

import express from 'express';
import request from 'supertest';
import { RepoService } from '../repo/repo.service';
import { McpService } from './mcp.service';

describe('McpService HTTP compatibility', () => {
  const buildApp = () => {
    const service = new McpService({} as RepoService);
    const app = express();
    app.use(express.json());
    app.all('/mcp', (req, res, next) => {
      void service.handle(req, res).catch(next);
    });
    app.all('/vibememory/mcp', (req, res, next) => {
      void service.handleVibeMemory(req, res).catch(next);
    });
    return app;
  };

  it('returns an immediate capability document for a bare GET probe', async () => {
    await request(buildApp())
      .get('/mcp')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            ok: true,
            status: 'ready',
            protocol: 'MCP Streamable HTTP',
          }),
        );
        expect(response.text).toContain('init_repo');
        expect(response.text).toContain('ask');
      });
  });

  it('returns an immediate capability document for an empty POST replay', async () => {
    await request(buildApp())
      .post('/mcp')
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ status: 'ready' }),
        );
      });
  });

  it('keeps a standard MCP initialize request on the MCP transport', async () => {
    await request(buildApp())
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'review-check', version: '1.0.0' },
        },
      })
      .expect(200)
      .expect('mcp-session-id', /.+/)
      .expect('content-type', /(application\/json|text\/event-stream)/);
  });

  it('does not treat a non-initialize MCP request as a readiness probe', async () => {
    await request(buildApp())
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      .expect(400);
  });

  it('returns the VibeMemory capability document on its bare endpoint', async () => {
    await request(buildApp())
      .get('/vibememory/mcp')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ tools: ['recall'] }),
        );
      });
  });
});
