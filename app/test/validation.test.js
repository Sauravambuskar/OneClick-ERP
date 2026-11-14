import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseId, validateCustomer, validateOrder, validateProduct } from '../src/validation.js';

test('validateProduct accepts a valid product and applies defaults', () => {
  const { value, errors } = validateProduct({ sku: ' SKU-1 ', name: 'Chair', unit_price: 10.5 });
  assert.equal(errors, undefined);
  assert.deepEqual(value, { sku: 'SKU-1', name: 'Chair', unit_price: 10.5, stock_qty: 0, reorder_level: 0 });
});

test('validateProduct rejects bad price, negative stock and missing fields', () => {
  const { errors } = validateProduct({ unit_price: 1.234, stock_qty: -1 });
  assert.equal(errors.length, 4);
});

test('validateCustomer checks email format', () => {
  assert.ok(validateCustomer({ name: 'A', email: 'not-an-email' }).errors);
  assert.ok(validateCustomer({ name: 'A', email: 'a@b.co' }).value);
});

test('validateOrder merges duplicate product lines', () => {
  const { value } = validateOrder({
    customer_id: 1,
    items: [
      { product_id: 2, quantity: 1 },
      { product_id: 2, quantity: 3 },
      { product_id: 5, quantity: 1 },
    ],
  });
  assert.deepEqual(value.items, [
    { product_id: 2, quantity: 4 },
    { product_id: 5, quantity: 1 },
  ]);
});

test('validateOrder rejects empty items and zero quantity', () => {
  assert.ok(validateOrder({ customer_id: 1, items: [] }).errors);
  assert.ok(validateOrder({ customer_id: 1, items: [{ product_id: 1, quantity: 0 }] }).errors);
});

test('parseId only accepts positive integers', () => {
  assert.equal(parseId('7'), 7);
  assert.equal(parseId('0'), null);
  assert.equal(parseId('abc'), null);
  assert.equal(parseId('1.5'), null);
});
