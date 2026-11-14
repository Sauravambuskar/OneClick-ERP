import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrder, updateOrderStatus } from '../src/services/orders.js';
import { fakeDb } from './fake-db.js';

test('createOrder computes the total and decrements stock', async () => {
  const db = fakeDb([
    { match: /FROM customers/, rows: [{ id: 1 }] },
    { match: /FROM products/, rows: [{ id: 10, sku: 'A', unit_price: '19.99', stock_qty: 5 }] },
    { match: /INSERT INTO sales_orders/, rows: [{ id: 99, customer_id: 1, status: 'NEW', total_amount: '59.97' }] },
  ]);
  const order = await createOrder({ query: db.query }, { customer_id: 1, items: [{ product_id: 10, quantity: 3 }] });

  assert.equal(order.id, 99);
  const insert = db.calls.find((c) => /INSERT INTO sales_orders/.test(c.text));
  assert.equal(insert.params[1], '59.97');
  const stockUpdate = db.calls.find((c) => /UPDATE products SET stock_qty = stock_qty -/.test(c.text));
  assert.deepEqual(stockUpdate.params, [3, 10]);
});

test('createOrder refuses to oversell', async () => {
  const db = fakeDb([
    { match: /FROM customers/, rows: [{ id: 1 }] },
    { match: /FROM products/, rows: [{ id: 10, sku: 'A', unit_price: '1.00', stock_qty: 2 }] },
  ]);
  await assert.rejects(
    createOrder({ query: db.query }, { customer_id: 1, items: [{ product_id: 10, quantity: 3 }] }),
    (err) => err.status === 409 && /insufficient stock/.test(err.message),
  );
  assert.ok(!db.calls.some((c) => /INSERT INTO sales_orders/.test(c.text)), 'no order must be written');
});

test('createOrder returns 404 for an unknown customer', async () => {
  const db = fakeDb([{ match: /FROM customers/, rows: [] }]);
  await assert.rejects(
    createOrder({ query: db.query }, { customer_id: 42, items: [{ product_id: 1, quantity: 1 }] }),
    (err) => err.status === 404,
  );
});

test('cancelling an order restocks its items', async () => {
  const db = fakeDb([
    { match: /SELECT id, status FROM sales_orders/, rows: [{ id: 5, status: 'NEW' }] },
    { match: /UPDATE sales_orders/, rows: [{ id: 5, status: 'CANCELLED' }] },
  ]);
  const updated = await updateOrderStatus({ query: db.query }, 5, 'CANCELLED');
  assert.equal(updated.status, 'CANCELLED');
  assert.ok(db.calls.some((c) => /stock_qty = p.stock_qty \+ i.quantity/.test(c.text)));
});

test('shipped orders are locked', async () => {
  const db = fakeDb([{ match: /SELECT id, status FROM sales_orders/, rows: [{ id: 5, status: 'SHIPPED' }] }]);
  await assert.rejects(updateOrderStatus({ query: db.query }, 5, 'CANCELLED'), (err) => err.status === 409);
});
