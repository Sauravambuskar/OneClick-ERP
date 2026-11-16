import { createDb } from '../../src/db.js';
import { migrate } from '../../src/migrate.js';

/**
 * Integration tests need a real PostgreSQL. The pipeline starts a throwaway
 * container and passes its URL in INTEGRATION_DATABASE_URL.
 *
 * When the variable is absent every integration test skips, so `npm test`
 * still runs clean on a laptop with no database.
 */
export const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL ?? '';
export const skip = DATABASE_URL ? false : 'INTEGRATION_DATABASE_URL is not set';

/** Connects, applies migrations, and empties the tables this suite writes to. */
export async function freshDb() {
  const db = createDb(DATABASE_URL);
  await migrate(db, () => {});
  // RESTART IDENTITY keeps ids predictable between runs; CASCADE handles the FKs.
  await db.query('TRUNCATE sales_order_items, sales_orders, products, customers RESTART IDENTITY CASCADE');
  return db;
}

/** @param {ReturnType<typeof createDb>} db */
export async function seedCustomer(db, name = 'Integration Test Co') {
  const { rows } = await db.query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [name]);
  return rows[0].id;
}

/** @param {ReturnType<typeof createDb>} db */
export async function seedProduct(db, { sku, price = '10.00', stock = 100 }) {
  const { rows } = await db.query(
    'INSERT INTO products (sku, name, unit_price, stock_qty) VALUES ($1, $2, $3, $4) RETURNING id',
    [sku, `Product ${sku}`, price, stock],
  );
  return rows[0].id;
}

/** @param {ReturnType<typeof createDb>} db */
export async function stockOf(db, productId) {
  const { rows } = await db.query('SELECT stock_qty FROM products WHERE id = $1', [productId]);
  return rows[0].stock_qty;
}
