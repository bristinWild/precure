import express from 'express';
import request from 'supertest';
import { configureProxyTrust } from './proxy';

describe('configureProxyTrust', () => {
  it('uses Railway’s forwarded HTTPS scheme', async () => {
    const app = express();
    configureProxyTrust(app);
    app.get('/protocol', (req, res) => res.json({ protocol: req.protocol }));

    await request(app)
      .get('/protocol')
      .set('X-Forwarded-Proto', 'https')
      .expect(200)
      .expect({ protocol: 'https' });
  });
});
