const STATUSES = new Set(["pending", "paid", "picking", "checking", "ready", "shipped", "delivered", "cancelled"]);

export async function ensureOrdersSchema(env) {
  if (!env.DB) throw new Error("Banco de pedidos não configurado.");
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_cpf TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      address_json TEXT NOT NULL,
      collection TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'Mercado Pago',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT NOT NULL DEFAULT '',
      preference_id TEXT NOT NULL DEFAULT '',
      carrier TEXT NOT NULL DEFAULT '',
      shipping_service TEXT NOT NULL DEFAULT '',
      shipping_deadline INTEGER NOT NULL DEFAULT 0,
      tracking_code TEXT NOT NULL DEFAULT '',
      freight REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      ref TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      collection TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      image TEXT NOT NULL DEFAULT '',
      barcode TEXT NOT NULL,
      scanned_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'sistema',
      created_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id, created_at)")
  ]);
}

export const barcodeFor = ({ sku }) => {
  let hash = 0;
  for (const ch of String(sku)) hash = (hash * 31 + ch.charCodeAt(0)) % 1000000000;
  return `789${String(hash).padStart(9, "0")}`;
};

export async function createOrder(env, order) {
  await ensureOrdersSchema(env);
  const now = new Date().toISOString();
  const collections = [...new Set(order.items.map(item => item.collection).filter(Boolean))].join(" / ");
  const statements = [
    env.DB.prepare(`INSERT INTO orders (
      id, created_at, updated_at, customer_name, customer_cpf, customer_phone, customer_email,
      address_json, collection, payment_method, payment_status, payment_id, preference_id,
      carrier, shipping_service, shipping_deadline, tracking_code, freight, subtotal, total, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?, ?, ?, '', ?, ?, ?, 'pending')`)
      .bind(order.id, now, now, order.customer.nome, order.customer.cpf, order.customer.telefone,
        order.customer.email, JSON.stringify(order.address), collections, "Mercado Pago", order.preferenceId,
        order.shipping.carrier, order.shipping.name, Number(order.shipping.deliveryTime || 0),
        Number(order.shipping.price || 0), order.subtotal, order.total),
    ...order.items.map(item => env.DB.prepare(`INSERT INTO order_items (
      order_id, sku, ref, name, category, collection, color, size, quantity, unit_price, image, barcode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(order.id, item.sku, item.ref, item.name, item.category, item.collection || "", item.color,
        item.size, item.quantity, item.price, item.image || "", barcodeFor(item))),
    env.DB.prepare("INSERT INTO order_events (order_id, event_type, description, actor, created_at) VALUES (?, 'created', 'Pedido recebido pela loja virtual', 'sistema', ?)")
      .bind(order.id, now)
  ];
  await env.DB.batch(statements);
}

export async function updatePayment(env, { orderId, paymentId, paymentStatus, paymentMethod }) {
  await ensureOrdersSchema(env);
  const status = paymentStatus === "approved" ? "paid" : ["cancelled", "rejected", "refunded", "charged_back"].includes(paymentStatus) ? "cancelled" : "pending";
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET payment_id=?, payment_status=?, payment_method=?, status=CASE WHEN status IN ('pending','paid') THEN ? ELSE status END, updated_at=? WHERE id=?")
      .bind(String(paymentId || ""), String(paymentStatus || "pending"), paymentMethod || "Mercado Pago", status, now, orderId),
    env.DB.prepare("INSERT INTO order_events (order_id, event_type, description, actor, created_at) VALUES (?, 'payment', ?, 'Mercado Pago', ?)")
      .bind(orderId, `Pagamento ${paymentStatus || "atualizado"}`, now)
  ]);
}

export async function listOrders(env) {
  await ensureOrdersSchema(env);
  const { results: rows = [] } = await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all();
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const marks = ids.map(() => "?").join(",");
  const { results: items = [] } = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (${marks}) ORDER BY id`).bind(...ids).all();
  const grouped = new Map(ids.map(id => [id, []]));
  items.forEach(item => grouped.get(item.order_id)?.push(item));
  return rows.map(row => ({ ...row, address: JSON.parse(row.address_json || "{}"), items: grouped.get(row.id) || [] }));
}

export async function getOrder(env, id) {
  await ensureOrdersSchema(env);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
  if (!order) return null;
  const [{ results: items = [] }, { results: events = [] }] = await Promise.all([
    env.DB.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").bind(id).all(),
    env.DB.prepare("SELECT * FROM order_events WHERE order_id=? ORDER BY created_at, id").bind(id).all()
  ]);
  return { ...order, address: JSON.parse(order.address_json || "{}"), items, events };
}

export async function getCustomerOrder(env, id, email, cpf) {
  const order = await getOrder(env, id);
  if (!order) return null;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCpf = String(cpf || "").replace(/\D/g, "");
  if (String(order.customer_email || "").trim().toLowerCase() !== normalizedEmail) return null;
  if (String(order.customer_cpf || "").replace(/\D/g, "") !== normalizedCpf) return null;
  return order;
}

export async function hasCompletedOrder(env, email, cpf) {
  await ensureOrdersSchema(env);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCpf = String(cpf || "").replace(/\D/g, "");
  const order = await env.DB.prepare(`SELECT id FROM orders
    WHERE (lower(customer_email)=? OR customer_cpf=?)
      AND (payment_status='approved' OR status IN ('paid','picking','checking','ready','shipped','delivered'))
    LIMIT 1`).bind(normalizedEmail, normalizedCpf).first();
  return Boolean(order);
}

export async function updateOrder(env, id, changes, actor) {
  await ensureOrdersSchema(env);
  const current = await getOrder(env, id);
  if (!current) return null;
  const nextStatus = STATUSES.has(changes.status) ? changes.status : current.status;
  const expected = current.items.reduce((sum, item) => sum + item.quantity, 0);
  const scanned = current.items.reduce((sum, item) => sum + item.scanned_quantity, 0);
  if (["ready", "shipped", "delivered"].includes(nextStatus) && scanned !== expected) {
    throw new Error("Bipe todas as peças antes de avançar para o envio.");
  }
  const now = new Date().toISOString();
  const carrier = String(changes.carrier ?? current.carrier).trim();
  const service = String(changes.shipping_service ?? current.shipping_service).trim();
  const tracking = String(changes.tracking_code ?? current.tracking_code).trim();
  const deadline = Math.max(0, Number(changes.shipping_deadline ?? current.shipping_deadline) || 0);
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status=?, carrier=?, shipping_service=?, shipping_deadline=?, tracking_code=?, updated_at=? WHERE id=?")
      .bind(nextStatus, carrier, service, deadline, tracking, now, id),
    env.DB.prepare("INSERT INTO order_events (order_id, event_type, description, actor, created_at) VALUES (?, 'updated', ?, ?, ?)")
      .bind(id, `Pedido atualizado para ${nextStatus}`, actor, now)
  ]);
  return getOrder(env, id);
}

export async function scanOrderItem(env, id, barcode, actor) {
  await ensureOrdersSchema(env);
  const order = await getOrder(env, id);
  if (!order) return null;
  if (["pending", "cancelled"].includes(order.status)) throw new Error("A conferência será liberada após a confirmação do pagamento.");
  const item = order.items.find(entry => entry.barcode === barcode);
  if (!item) throw new Error("Código não pertence a este pedido.");
  if (item.scanned_quantity >= item.quantity) throw new Error("A quantidade deste item já foi totalmente conferida.");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE order_items SET scanned_quantity=scanned_quantity+1 WHERE id=?").bind(item.id).run();
  const updated = await getOrder(env, id);
  const complete = updated.items.every(entry => entry.scanned_quantity === entry.quantity);
  const status = complete ? "ready" : "checking";
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status=?, updated_at=? WHERE id=?").bind(status, now, id),
    env.DB.prepare("INSERT INTO order_events (order_id, event_type, description, actor, created_at) VALUES (?, 'scan', ?, ?, ?)")
      .bind(id, `Peça conferida: ${item.sku}`, actor, now)
  ]);
  return getOrder(env, id);
}
