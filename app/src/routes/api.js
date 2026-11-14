import { Router } from 'express';
import { ORDER_STATUSES, parseId, validateCustomer, validateOrder, validateProduct } from '../validation.js';
import { HttpError, createOrder, updateOrderStatus } from '../services/orders.js';

/** Throws a 400 with all validation messages when `result.errors` is set. */
function unwrap(result) {
  if (result.errors) {
    const err = new HttpError(400, 'validation failed');
    err.details = result.errors;
    throw err;
  }
  return result.value;
}

function idParam(req) {
  const id = parseId(req.params.id);
  if (!id) throw new HttpError(400, 'id must be a positive integer');
  return id;
}

/** @param {{ query: Function, tx: Function }} db */
export function apiRouter(db) {
  const r = Router();

  // ---------- Dashboard ----------
  r.get('/dashboard', async (_req, res) => {
    const { rows: [stats] } = await db.query(`SELECT
        (SELECT count(*)::int FROM products)                                      AS products,
        (SELECT count(*)::int FROM customers)                                     AS customers,
        (SELECT count(*)::int FROM sales_orders WHERE status <> 'CANCELLED')      AS orders,
        (SELECT coalesce(sum(total_amount), 0)::text FROM sales_orders WHERE status <> 'CANCELLED') AS revenue`);
    const { rows: lowStock } = await db.query(
      'SELECT id, sku, name, stock_qty, reorder_level FROM products WHERE stock_qty <= reorder_level ORDER BY stock_qty LIMIT 10',
    );
    res.json({ ...stats, low_stock: lowStock });
  });

  // ---------- Products / inventory ----------
  r.get('/products', async (_req, res) => {
    const { rows } = await db.query(
      'SELECT id, sku, name, unit_price, stock_qty, reorder_level, updated_at FROM products ORDER BY name',
    );
    res.json(rows);
  });

  r.post('/products', async (req, res) => {
    const p = unwrap(validateProduct(req.body));
    const { rows: [row] } = await db.query(
      `INSERT INTO products (sku, name, unit_price, stock_qty, reorder_level) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sku, name, unit_price, stock_qty, reorder_level, updated_at`,
      [p.sku, p.name, p.unit_price, p.stock_qty, p.reorder_level],
    );
    res.status(201).json(row);
  });

  r.put('/products/:id', async (req, res) => {
    const id = idParam(req);
    const p = unwrap(validateProduct(req.body));
    const { rows } = await db.query(
      `UPDATE products SET sku = $1, name = $2, unit_price = $3, stock_qty = $4, reorder_level = $5, updated_at = now()
       WHERE id = $6 RETURNING id, sku, name, unit_price, stock_qty, reorder_level, updated_at`,
      [p.sku, p.name, p.unit_price, p.stock_qty, p.reorder_level, id],
    );
    if (rows.length === 0) throw new HttpError(404, `product ${id} not found`);
    res.json(rows[0]);
  });

  r.delete('/products/:id', async (req, res) => {
    const id = idParam(req);
    const { rowCount } = await db.query('DELETE FROM products WHERE id = $1', [id]);
    if (rowCount === 0) throw new HttpError(404, `product ${id} not found`);
    res.status(204).end();
  });

  // ---------- Customers ----------
  r.get('/customers', async (_req, res) => {
    const { rows } = await db.query('SELECT id, name, email, phone, created_at FROM customers ORDER BY name');
    res.json(rows);
  });

  r.post('/customers', async (req, res) => {
    const c = unwrap(validateCustomer(req.body));
    const { rows: [row] } = await db.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING id, name, email, phone, created_at',
      [c.name, c.email, c.phone],
    );
    res.status(201).json(row);
  });

  r.delete('/customers/:id', async (req, res) => {
    const id = idParam(req);
    const { rowCount } = await db.query('DELETE FROM customers WHERE id = $1', [id]);
    if (rowCount === 0) throw new HttpError(404, `customer ${id} not found`);
    res.status(204).end();
  });

  // ---------- Sales orders ----------
  r.get('/orders', async (_req, res) => {
    const { rows } = await db.query(`SELECT o.id, o.status, o.total_amount, o.created_at,
             c.id AS customer_id, c.name AS customer_name,
             (SELECT count(*)::int FROM sales_order_items i WHERE i.order_id = o.id) AS line_count
        FROM sales_orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.id DESC LIMIT 200`);
    res.json(rows);
  });

  r.post('/orders', async (req, res) => {
    const order = unwrap(validateOrder(req.body));
    const created = await db.tx((client) => createOrder(client, order));
    res.status(201).json(created);
  });

  r.patch('/orders/:id/status', async (req, res) => {
    const id = idParam(req);
    const status = req.body?.status;
    if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${ORDER_STATUSES.join(', ')}`);
    const updated = await db.tx((client) => updateOrderStatus(client, id, status));
    res.json(updated);
  });

  return r;
}
