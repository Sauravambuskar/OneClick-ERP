export class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
    /** @type {string[] | undefined} */
    this.details = undefined;
  }
}

/**
 * Creates a sales order and reserves stock atomically.
 * Must run inside a transaction (db.tx) so the row locks and the stock
 * decrement either all happen or none do.
 * @param {{ query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }> }} client
 * @param {{ customer_id: number, items: { product_id: number, quantity: number }[] }} order
 */
export async function createOrder(client, order) {
  const customer = await client.query('SELECT id FROM customers WHERE id = $1', [order.customer_id]);
  if (customer.rows.length === 0) throw new HttpError(404, `customer ${order.customer_id} not found`);

  const ids = order.items.map((i) => i.product_id);
  const { rows: products } = await client.query(
    'SELECT id, sku, unit_price, stock_qty FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
    [ids],
  );
  const byId = new Map(products.map((p) => [p.id, p]));

  let totalCents = 0;
  for (const item of order.items) {
    const p = byId.get(item.product_id);
    if (!p) throw new HttpError(404, `product ${item.product_id} not found`);
    if (p.stock_qty < item.quantity) {
      throw new HttpError(409, `insufficient stock for ${p.sku}: requested ${item.quantity}, available ${p.stock_qty}`);
    }
    totalCents += Math.round(Number(p.unit_price) * 100) * item.quantity;
  }

  const { rows: [created] } = await client.query(
    'INSERT INTO sales_orders (customer_id, total_amount) VALUES ($1, $2) RETURNING id, customer_id, status, total_amount, created_at',
    [order.customer_id, (totalCents / 100).toFixed(2)],
  );

  for (const item of order.items) {
    const p = byId.get(item.product_id);
    await client.query(
      'INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
      [created.id, item.product_id, item.quantity, p.unit_price],
    );
    await client.query('UPDATE products SET stock_qty = stock_qty - $1, updated_at = now() WHERE id = $2', [
      item.quantity,
      item.product_id,
    ]);
  }
  return { ...created, items: order.items };
}

/**
 * Changes an order's status. Cancelling returns its stock to inventory.
 * @param {{ query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }> }} client
 * @param {number} orderId
 * @param {string} status
 */
export async function updateOrderStatus(client, orderId, status) {
  const { rows } = await client.query('SELECT id, status FROM sales_orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (rows.length === 0) throw new HttpError(404, `order ${orderId} not found`);
  const current = rows[0].status;
  if (current === 'CANCELLED') throw new HttpError(409, 'order is already cancelled');
  if (current === 'SHIPPED') throw new HttpError(409, 'shipped orders cannot change status');

  if (status === 'CANCELLED') {
    await client.query(
      `UPDATE products p SET stock_qty = p.stock_qty + i.quantity, updated_at = now()
         FROM sales_order_items i WHERE i.order_id = $1 AND i.product_id = p.id`,
      [orderId],
    );
  }
  const { rows: [updated] } = await client.query(
    'UPDATE sales_orders SET status = $1 WHERE id = $2 RETURNING id, customer_id, status, total_amount, created_at',
    [status, orderId],
  );
  return updated;
}
