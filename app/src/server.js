import { createApp } from './app.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://erp:erp@localhost:5432/erp';
const VERSION = process.env.APP_VERSION ?? 'dev';

// Structured one-line JSON logs: easy to search in CloudWatch Logs Insights.
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, version: VERSION, ...extra }));

async function waitForDb(db, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      log('warn', 'database not ready, retrying', { attempt: i, error: err.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('database never became ready');
}

const db = createDb(DATABASE_URL);
await waitForDb(db);
await migrate(db, (m) => log('info', m));

const app = createApp({ db, version: VERSION, log: (m) => log('error', m) });
const server = app.listen(PORT, () => log('info', 'ERP listening', { port: PORT }));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log('info', 'shutting down', { signal });
    server.close(() => db.close().then(() => process.exit(0)));
  });
}
