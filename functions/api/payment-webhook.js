const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let body = {};
  try { body = await request.json(); } catch {}
  const paymentId = body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");
  if (!paymentId || !env.MERCADO_PAGO_ACCESS_TOKEN) return json({ received: true });

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}` },
  });
  if (!response.ok) return json({ received: true });
  const payment = await response.json();
  if (payment.external_reference && env.DB) {
    await updatePayment(env, {
      orderId: String(payment.external_reference),
      paymentId: String(payment.id || ""),
      paymentStatus: String(payment.status || "pending"),
      paymentMethod: payment.payment_type_id === "bank_transfer" ? "Pix" : `Cartão · ${payment.installments || 1}x`,
    });
  }
  console.log("ORLA payment update", {
    payment_id: payment.id,
    status: payment.status,
    external_reference: payment.external_reference,
  });
  return json({ received: true });
}
import { updatePayment } from "../_lib/orders-db.js";
