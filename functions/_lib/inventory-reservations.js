const RESERVATION_MINUTES = 30;

const cleanSessionId = value => {
  const sessionId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new Error("Sessão da sacola inválida.");
  return sessionId;
};

const normalizeItems = items => {
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const sku = String(item?.sku || "").trim();
    const quantity = Math.trunc(Number(item?.quantity || 0));
    if (!sku || quantity < 1) throw new Error("Confira os itens da sacola.");
    grouped.set(sku, (grouped.get(sku) || 0) + quantity);
  }
  return [...grouped].map(([sku, quantity]) => ({ sku, quantity }));
};

async function loadAssetJson(env, origin, filename, prefix = "") {
  const response = await env.ASSETS.fetch(`${origin}/${filename}`);
  if (!response.ok) throw new Error(`Não foi possível carregar ${filename}.`);
  const source = await response.text();
  if (!prefix) return JSON.parse(source);
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Formato inválido em ${filename}.`);
  return JSON.parse(source.slice(start + prefix.length).trim().replace(/;\s*$/, ""));
}

export async function loadInventorySnapshot(env, origin) {
  const [stock, meta] = await Promise.all([
    loadAssetJson(env, origin, "stock-data.js", "window.ORLA_STORE_STOCK="),
    loadAssetJson(env, origin, "stock-meta.json").catch(() => ({ syncedAt: "1970-01-01T00:00:00.000Z" })),
  ]);
  return { stock, syncedAt: String(meta?.syncedAt || "1970-01-01T00:00:00.000Z") };
}

export async function ensureReservationSchema(env) {
  if (!env.DB) throw new Error("Banco de reservas não configurado.");
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS cart_reservations (
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
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_cart_reservations_sku ON cart_reservations(sku, status, expires_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_cart_reservations_order ON cart_reservations(order_id)"),
  ]);
}

const activeSql = `(status='active' AND expires_at>?) OR (status='confirmed' AND confirmed_at>?)`;

async function cleanupReservations(env, now, syncedAt) {
  await env.DB.prepare(`DELETE FROM cart_reservations
    WHERE (status='active' AND expires_at<=?)
       OR (status='confirmed' AND confirmed_at<=?)
       OR status='released'`).bind(now, syncedAt).run();
}

export async function inventoryForSession(env, origin, rawSessionId = "") {
  await ensureReservationSchema(env);
  const sessionId = rawSessionId ? cleanSessionId(rawSessionId) : "";
  const now = new Date().toISOString();
  const { stock, syncedAt } = await loadInventorySnapshot(env, origin);
  await cleanupReservations(env, now, syncedAt);
  const { results = [] } = await env.DB.prepare(`SELECT sku, SUM(quantity) AS reserved
    FROM cart_reservations
    WHERE (${activeSql}) AND session_id<>?
    GROUP BY sku`).bind(now, syncedAt, sessionId).all();
  const reserved = new Map(results.map(row => [String(row.sku), Number(row.reserved || 0)]));
  const available = {};
  for (const [sku, quantity] of Object.entries(stock || {})) {
    available[sku] = Math.max(0, Math.trunc(Number(quantity || 0)) - (reserved.get(sku) || 0));
  }
  let expiresAt = "";
  if (sessionId) {
    const row = await env.DB.prepare(`SELECT MAX(expires_at) AS expires_at FROM cart_reservations
      WHERE session_id=? AND status='active' AND expires_at>?`).bind(sessionId, now).first();
    expiresAt = String(row?.expires_at || "");
  }
  return { stock: available, syncedAt, expiresAt };
}

export async function reserveCart(env, origin, rawSessionId, rawItems) {
  await ensureReservationSchema(env);
  const sessionId = cleanSessionId(rawSessionId);
  const items = normalizeItems(rawItems);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + RESERVATION_MINUTES * 60_000).toISOString();
  const { stock, syncedAt } = await loadInventorySnapshot(env, origin);
  await cleanupReservations(env, now, syncedAt);

  if (!items.length) {
    await env.DB.prepare("DELETE FROM cart_reservations WHERE session_id=? AND status='active'").bind(sessionId).run();
    return { reserved: true, expiresAt: "", minutes: RESERVATION_MINUTES };
  }
  for (const item of items) {
    if (!Object.hasOwn(stock, item.sku) || Number(stock[item.sku] || 0) < 1) {
      throw new Error("Uma das peças escolhidas não está mais disponível.");
    }
  }

  const statements = [
    env.DB.prepare("DELETE FROM cart_reservations WHERE session_id=? AND status='active'").bind(sessionId),
  ];
  for (const item of items) {
    const base = Math.max(0, Math.trunc(Number(stock[item.sku] || 0)));
    statements.push(env.DB.prepare(`INSERT INTO cart_reservations
      (session_id, sku, quantity, status, order_id, created_at, updated_at, expires_at, confirmed_at)
      VALUES (?, ?, CASE WHEN ? <= ? - COALESCE((
        SELECT SUM(quantity) FROM cart_reservations
        WHERE sku=? AND session_id<>? AND (${activeSql})
      ), 0) THEN ? ELSE NULL END, 'active', '', ?, ?, ?, '')`)
      .bind(sessionId, item.sku, item.quantity, base, item.sku, sessionId, now, syncedAt,
        item.quantity, now, now, expiresAt));
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.warn("ORLA reservation rejected", { session_id: sessionId, error: error?.message });
    throw new Error("Uma das peças acabou de ser reservada por outra cliente. Atualize a sacola.");
  }
  return { reserved: true, expiresAt, minutes: RESERVATION_MINUTES };
}

export async function requireActiveReservation(env, rawSessionId, rawItems) {
  await ensureReservationSchema(env);
  const sessionId = cleanSessionId(rawSessionId);
  const items = normalizeItems(rawItems);
  const now = new Date().toISOString();
  const { results = [] } = await env.DB.prepare(`SELECT sku, quantity FROM cart_reservations
    WHERE session_id=? AND status='active' AND expires_at>?`).bind(sessionId, now).all();
  const reserved = new Map(results.map(row => [String(row.sku), Number(row.quantity || 0)]));
  if (!items.length || items.some(item => reserved.get(item.sku) !== item.quantity)) {
    throw new Error("A reserva da sua sacola expirou. Escolha novamente as peças disponíveis.");
  }
  return sessionId;
}

export async function attachReservationToOrder(env, rawSessionId, orderId) {
  const sessionId = cleanSessionId(rawSessionId);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE cart_reservations SET order_id=?, updated_at=?
    WHERE session_id=? AND status='active' AND expires_at>?`).bind(orderId, now, sessionId, now).run();
}

export async function updateReservationPayment(env, orderId, paymentStatus) {
  if (!env.DB || !orderId) return;
  await ensureReservationSchema(env);
  const now = new Date().toISOString();
  if (paymentStatus === "approved") {
    await env.DB.prepare(`UPDATE cart_reservations
      SET status='confirmed', confirmed_at=?, updated_at=? WHERE order_id=? AND status='active'`)
      .bind(now, now, orderId).run();
    return;
  }
  if (["cancelled", "rejected", "refunded", "charged_back"].includes(paymentStatus)) {
    await env.DB.prepare("DELETE FROM cart_reservations WHERE order_id=? AND status='active'").bind(orderId).run();
  }
}

