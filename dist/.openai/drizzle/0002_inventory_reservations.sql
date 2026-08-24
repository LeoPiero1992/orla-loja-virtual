CREATE TABLE IF NOT EXISTS cart_reservations (
  session_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  status TEXT NOT NULL DEFAULT 'active',
  order_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(session_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_cart_reservations_sku ON cart_reservations(sku, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_cart_reservations_order ON cart_reservations(order_id);
