-- Demo data so the first deployment shows something useful.
INSERT INTO customers (name, email, phone) VALUES
  ('Acme Traders',      'orders@acme.example',  '+1-555-0100'),
  ('Globex Retail',     'buying@globex.example', '+1-555-0101'),
  ('Initech Supplies',  NULL,                    '+1-555-0102');

INSERT INTO products (sku, name, unit_price, stock_qty, reorder_level) VALUES
  ('SKU-1001', 'Office Chair',        149.00, 25, 5),
  ('SKU-1002', 'Standing Desk',       399.00, 8,  3),
  ('SKU-1003', 'Monitor 27"',         229.99, 15, 4),
  ('SKU-1004', 'Wireless Keyboard',   49.50,  60, 10),
  ('SKU-1005', 'USB-C Dock',          89.00,  2,  5)
ON CONFLICT (sku) DO NOTHING;
