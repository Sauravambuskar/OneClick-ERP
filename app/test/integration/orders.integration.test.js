// Integration tests: real PostgreSQL, real transactions, real locking.
//
// These cover the behaviour the unit tests with a fake database cannot prove —
// that a transaction actually rolls back, and that two concurrent orders for
// the same product cannot oversell it. Both depend on the database engine, not
// on our JavaScript.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createOrder, updateOrderStatus } from '../../src/services/orders.js';
import { freshDb, seedCustomer, seedProduct, stockOf, skip } from './helper.js';

/** @type {any} */
let db;

before(async () => {
  if (skip) return;
  db = await freshDb();
});

after(async () => {
  await db?.close();
});

test('migrations apply to an empty database and are idempotent', { skip }, async () => {
  const { rows } = await db.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.ok(rows.length > 0, 'expected at least one applied migration');

  // freshDb() already ran migrate() once; running it again must be a no-op.
  const { migrate } = await import('../../src/migrate.js');
  await migrate(db, () => {});
  const second = await db.query('SELECT count(*)::int AS n FROM schema_migrations');
  assert.equal(second.rows[0].n, rows.length, 'a second migrate() applied something twice');
});

test('creating an order decrements stock and records the line items', { skip }, async () => {
  const customerId = await seedCustomer(db);
  const productId = await seedProduct(db, { sku: 'INT-STOCK-1', price: '25.00', stock: 40 });

  const order = await db.tx((client) =>
    createOrder(client, { customer_id: customerId, items: [{ product_id: productId, quantity: 3 }] }),
  );

  assert.equal(await stockOf(db, productId), 37);
  assert.equal(order.total_amount, '75.00');

  const { rows: items } = await db.query('SELECT quantity, unit_price FROM sales_order_items WHERE order_id = $1', [
    order.id,
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].unit_price, '25.00');
});

test('an order that runs out of stock partway leaves nothing behind', { skip }, async () => {
  const customerId = await seedCustomer(db);
  const plenty = await seedProduct(db, { sku: 'INT-ROLLBACK-OK', stock: 50 });
  const scarce = await seedProduct(db, { sku: 'INT-ROLLBACK-LOW', stock: 1 });

  const ordersBefore = await db.query('SELECT count(*)::int AS n FROM sales_orders');

  await assert.rejects(
    db.tx((client) =>
      createOrder(client, {
        customer_id: customerId,
        items: [
          { product_id: plenty, quantity: 5 },
          { product_id: scarce, quantity: 99 },
        ],
      }),
    ),
    /insufficient stock/,
  );

  // The first product's stock must be untouched — this is what proves the
  // transaction rolled back rather than partially applying.
  assert.equal(await stockOf(db, plenty), 50);
  assert.equal(await stockOf(db, scarce), 1);

  const ordersAfter = await db.query('SELECT count(*)::int AS n FROM sales_orders');
  assert.equal(ordersAfter.rows[0].n, ordersBefore.rows[0].n, 'a failed order was still written');
});

test('two concurrent orders cannot oversell the same product', { skip }, async () => {
  const customerId = await seedCustomer(db);
  const productId = await seedProduct(db, { sku: 'INT-RACE', stock: 10 });

  const attempt = () =>
    db.tx((client) => createOrder(client, { customer_id: customerId, items: [{ product_id: productId, quantity: 10 }] }));

  const results = await Promise.allSettled([attempt(), attempt()]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'both orders succeeded — the SELECT ... FOR UPDATE lock is not holding');
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /insufficient stock/);
  assert.equal(await stockOf(db, productId), 0);
});

test('cancelling an order returns its stock to inventory', { skip }, async () => {
  const customerId = await seedCustomer(db);
  const productId = await seedProduct(db, { sku: 'INT-CANCEL', stock: 20 });

  const order = await db.tx((client) =>
    createOrder(client, { customer_id: customerId, items: [{ product_id: productId, quantity: 8 }] }),
  );
  assert.equal(await stockOf(db, productId), 12);

  const cancelled = await db.tx((client) => updateOrderStatus(client, order.id, 'CANCELLED'));

  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(await stockOf(db, productId), 20);
});

test('cancelling twice is refused and does not double-credit stock', { skip }, async () => {
  const customerId = await seedCustomer(db);
  const productId = await seedProduct(db, { sku: 'INT-DOUBLE-CANCEL', stock: 15 });

  const order = await db.tx((client) =>
    createOrder(client, { customer_id: customerId, items: [{ product_id: productId, quantity: 5 }] }),
  );
  await db.tx((client) => updateOrderStatus(client, order.id, 'CANCELLED'));
  assert.equal(await stockOf(db, productId), 15);

  await assert.rejects(db.tx((client) => updateOrderStatus(client, order.id, 'CANCELLED')), /already cancelled/);
  assert.equal(await stockOf(db, productId), 15, 'stock was credited a second time');
});

test('GET /health reports the real database as up', { skip }, async () => {
  const res = await request(createApp({ db, version: 'integration', log: () => {} })).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', version: 'integration', database: 'up' });
});

test('POST /api/orders through the HTTP layer moves real stock', { skip }, async () => {
  const customerId = await seedCustomer(db);
  const productId = await seedProduct(db, { sku: 'INT-HTTP', price: '12.50', stock: 30 });
  const app = createApp({ db, version: 'integration', log: () => {} });

  const res = await request(app)
    .post('/api/orders')
    .send({ customer_id: customerId, items: [{ product_id: productId, quantity: 4 }] });

  assert.equal(res.status, 201);
  assert.equal(res.body.total_amount, '50.00');
  assert.equal(await stockOf(db, productId), 26);
});
