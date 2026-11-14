-- Core ERP schema: customers, products (with inventory), sales orders.

CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  sku           TEXT          NOT NULL UNIQUE,
  name          TEXT          NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  stock_qty     INTEGER       NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level INTEGER       NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER       NOT NULL REFERENCES customers(id),
  status       TEXT          NOT NULL DEFAULT 'NEW'
                             CHECK (status IN ('NEW', 'CONFIRMED', 'SHIPPED', 'CANCELLED')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER       NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INTEGER       NOT NULL REFERENCES products(id),
  quantity   INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_items_order     ON sales_order_items(order_id);
