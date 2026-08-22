const digits = value => String(value || "").replace(/\D/g, "");

const formatCurrency = value => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const textParameter = value => ({
  type: "text",
  text: String(value || "-").trim().slice(0, 1024) || "-",
});

async function ensureNotificationSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS outbound_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    provider_id TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

async function reserveNotification(env, dedupeKey, orderId) {
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO outbound_notifications
    (dedupe_key, order_id, channel, status, created_at, updated_at)
    VALUES (?, ?, 'whatsapp', 'sending', ?, ?)`)
    .bind(dedupeKey, orderId, now, now)
    .run();
  if (Number(inserted.meta?.changes || 0) > 0) return true;

  const current = await env.DB.prepare("SELECT status, updated_at FROM outbound_notifications WHERE dedupe_key=?")
    .bind(dedupeKey)
    .first();
  if (!current || current.status === "sent") return false;

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const retried = await env.DB.prepare(`UPDATE outbound_notifications
    SET status='sending', last_error='', updated_at=?
    WHERE dedupe_key=? AND (status='failed' OR updated_at<?)`)
    .bind(now, dedupeKey, staleBefore)
    .run();
  return Number(retried.meta?.changes || 0) > 0;
}

async function finishNotification(env, dedupeKey, status, providerId = "", error = "") {
  await env.DB.prepare(`UPDATE outbound_notifications
    SET status=?, provider_id=?, last_error=?, updated_at=? WHERE dedupe_key=?`)
    .bind(status, providerId, String(error || "").slice(0, 500), new Date().toISOString(), dedupeKey)
    .run();
}

export async function sendPaymentApprovedWhatsApp(env, order) {
  if (!env.DB || !order?.id) return { sent: false, reason: "missing_order" };
  const required = [env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_TEMPLATE_NAME, env.WHATSAPP_GRAPH_API_VERSION];
  if (required.some(value => !value)) return { sent: false, reason: "not_configured" };

  await ensureNotificationSchema(env);
  const dedupeKey = `payment-approved:${order.id}`;
  if (!await reserveNotification(env, dedupeKey, order.id)) {
    return { sent: false, reason: "already_processed" };
  }

  const address = order.address || {};
  const version = String(env.WHATSAPP_GRAPH_API_VERSION).replace(/^\/?/, "");
  const target = digits(env.WHATSAPP_NOTIFICATION_NUMBER || "554333740204");
  const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: target,
        type: "template",
        template: {
          name: String(env.WHATSAPP_TEMPLATE_NAME),
          language: { code: String(env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR") },
          components: [{
            type: "body",
            parameters: [
              textParameter(order.customer_name),
              textParameter(order.id),
              textParameter(formatCurrency(order.total)),
              textParameter(address.cidade),
              textParameter(address.estado),
            ],
          }],
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || `WhatsApp HTTP ${response.status}`);
    const providerId = String(result?.messages?.[0]?.id || "");
    await finishNotification(env, dedupeKey, "sent", providerId);
    console.log("ORLA WhatsApp notification sent", { order_id: order.id, provider_id: providerId });
    return { sent: true, providerId };
  } catch (error) {
    await finishNotification(env, dedupeKey, "failed", "", error?.message || "Falha no WhatsApp");
    console.error("ORLA WhatsApp notification failed", { order_id: order.id, error: error?.message });
    throw error;
  }
}
