CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL, customer_cpf TEXT NOT NULL, customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL, address_json TEXT NOT NULL, collection TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'Mercado Pago', payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_id TEXT NOT NULL DEFAULT '', preference_id TEXT NOT NULL DEFAULT '', carrier TEXT NOT NULL DEFAULT '',
  shipping_service TEXT NOT NULL DEFAULT '', shipping_deadline INTEGER NOT NULL DEFAULT 0,
  tracking_code TEXT NOT NULL DEFAULT '', freight REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, sku TEXT NOT NULL, ref TEXT NOT NULL,
  name TEXT NOT NULL, category TEXT NOT NULL, collection TEXT NOT NULL DEFAULT '', color TEXT NOT NULL,
  size TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, image TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL, scanned_quantity INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, event_type TEXT NOT NULL,
  description TEXT NOT NULL, actor TEXT NOT NULL DEFAULT 'sistema', created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id, created_at);
