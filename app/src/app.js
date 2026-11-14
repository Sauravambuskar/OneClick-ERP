import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Builds the Express app. The database is injected so tests can use a fake.
 * @param {{ db: { query: Function, tx: Function }, version?: string, log?: (msg: string) => void }} deps
 */
export function createApp({ db, version = 'dev', log = console.error }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Basic security headers (no extra dependency needed for a small app).
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'",
    });
    next();
  });

  // Health check used by Docker, the deploy script and the pipeline smoke test.
  app.get('/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', version, database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', version, database: 'down' });
    }
  });

  app.use('/api', apiRouter(db));
  app.use(express.static(PUBLIC_DIR));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // Central error handler: known errors keep their status, unknown ones become 500.
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
    if (err.code === '23505') return res.status(409).json({ error: 'a record with this unique value already exists' });
    if (err.code === '23503') return res.status(409).json({ error: 'record is referenced by other data' });
    const status = Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) log(`[error] ${err.stack || err}`);
    res.status(status).json({ error: status >= 500 ? 'internal server error' : err.message, details: err.details });
  });

  return app;
}
