// Small hand-rolled validators: no extra dependency, easy to read and test.

const isNonEmptyString = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const isNonNegativeInt = (v) => Number.isInteger(v) && v >= 0;
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;
const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.abs(Math.round(v * 100) - v * 100) < 1e-9;

export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'SHIPPED', 'CANCELLED'];

/** @param {any} body */
export function validateProduct(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return { errors: ['body must be a JSON object'] };
  if (!isNonEmptyString(body.sku, 40)) errors.push('sku is required (max 40 chars)');
  if (!isNonEmptyString(body.name)) errors.push('name is required (max 200 chars)');
  if (!isMoney(body.unit_price)) errors.push('unit_price must be a non-negative number with at most 2 decimals');
  const stock = body.stock_qty ?? 0;
  if (!isNonNegativeInt(stock)) errors.push('stock_qty must be a non-negative integer');
  const reorder = body.reorder_level ?? 0;
  if (!isNonNegativeInt(reorder)) errors.push('reorder_level must be a non-negative integer');
  if (errors.length) return { errors };
  return {
    value: { sku: body.sku.trim(), name: body.name.trim(), unit_price: body.unit_price, stock_qty: stock, reorder_level: reorder },
  };
}

/** @param {any} body */
export function validateCustomer(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return { errors: ['body must be a JSON object'] };
  if (!isNonEmptyString(body.name)) errors.push('name is required (max 200 chars)');
  if (body.email != null && !(typeof body.email === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(body.email))) {
    errors.push('email is not valid');
  }
  if (body.phone != null && !isNonEmptyString(body.phone, 30)) errors.push('phone must be at most 30 chars');
  if (errors.length) return { errors };
  return { value: { name: body.name.trim(), email: body.email ?? null, phone: body.phone ?? null } };
}

/** @param {any} body */
export function validateOrder(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return { errors: ['body must be a JSON object'] };
  if (!isPositiveInt(body.customer_id)) errors.push('customer_id must be a positive integer');
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items must be a non-empty array');
  } else {
    body.items.forEach((item, i) => {
      if (!item || !isPositiveInt(item.product_id)) errors.push(`items[${i}].product_id must be a positive integer`);
      if (!item || !isPositiveInt(item.quantity)) errors.push(`items[${i}].quantity must be a positive integer`);
    });
  }
  if (errors.length) return { errors };
  // Merge duplicate product lines so stock is checked once per product.
  const merged = new Map();
  for (const { product_id, quantity } of body.items) merged.set(product_id, (merged.get(product_id) ?? 0) + quantity);
  return {
    value: {
      customer_id: body.customer_id,
      items: [...merged].map(([product_id, quantity]) => ({ product_id, quantity })),
    },
  };
}

/** @param {unknown} id */
export function parseId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}
