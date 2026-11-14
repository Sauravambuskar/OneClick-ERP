import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Applies every migrations/*.sql file that has not run yet, in filename order,
 * each inside its own transaction. Safe to run on every start-up.
 * @param {{ tx: (fn: (client: any) => Promise<any>) => Promise<any>, query: (t: string, p?: unknown[]) => Promise<any> }} db
 */
export async function migrate(db, log = console.log) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    // Reviewed: `file` comes from readdir() of the fixed migrations folder, never from user input.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.tx(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    log(`[migrate] applied ${file}`);
  }
}
