import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { fakeDb } from './fake-db.js';

const quiet = () => {};

test('GET /health reports ok when the database answers', async () => {
  const app = createApp({ db: fakeDb([{ match: /SELECT 1/, rows: [{}] }]), version: 'test-1', log: quiet });
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', version: 'test-1', database: 'up' });
});

test('GET /health returns 503 when the database is down', async () => {
  const app = createApp({ db: fakeDb([{ match: /SELECT 1/, error: new Error('down') }]), log: quiet });
  const res = await request(app).get('/health');
  assert.equal(res.status, 503);
});

test('GET /api/products returns rows from the database', async () => {
  const rows = [{ id: 1, sku: 'A', name: 'Chair' }];
  const app = createApp({ db: fakeDb([{ match: /FROM products/, rows }]), log: quiet });
  const res = await request(app).get('/api/products');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, rows);
});

test('POST /api/products validates input before touching the database', async () => {
  const db = fakeDb();
  const res = await request(createApp({ db, log: quiet })).post('/api/products').send({ name: '' });
  assert.equal(res.status, 400);
  assert.ok(res.body.details.length > 0);
  assert.equal(db.calls.length, 0);
});

test('duplicate SKU maps to 409', async () => {
  const dup = Object.assign(new Error('duplicate key'), { code: '23505' });
  const app = createApp({ db: fakeDb([{ match: /INSERT INTO products/, error: dup }]), log: quiet });
  const res = await request(app).post('/api/products').send({ sku: 'A', name: 'Chair', unit_price: 1 });
  assert.equal(res.status, 409);
});

test('unexpected errors become a generic 500', async () => {
  const app = createApp({ db: fakeDb([{ match: /FROM customers/, error: new Error('secret detail') }]), log: quiet });
  const res = await request(app).get('/api/customers');
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'internal server error');
});

test('PATCH /api/orders/:id/status rejects unknown statuses', async () => {
  const res = await request(createApp({ db: fakeDb(), log: quiet })).patch('/api/orders/1/status').send({ status: 'LOST' });
  assert.equal(res.status, 400);
});

test('security headers are set', async () => {
  const res = await request(createApp({ db: fakeDb(), log: quiet })).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
