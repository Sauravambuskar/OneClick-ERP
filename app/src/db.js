import pg from 'pg';

/**
 * Creates the database access object used by the whole app.
 * `query` runs a single statement; `tx` runs a callback inside a transaction.
 * Tests pass a fake object with the same methods.
 * @param {string} connectionString
 */
export function createDb(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10 });

  return {
    pool,
    /** @param {string} text @param {unknown[]} [params] */
    query: (text, params) => pool.query(text, params),
    /**
     * @template T
     * @param {(client: pg.PoolClient) => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
