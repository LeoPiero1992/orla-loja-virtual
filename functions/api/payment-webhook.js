const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestPost(context) {
  const { request, env } = context;
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
    await updateReservationPayment(env, String(payment.external_reference), String(payment.status || "pending"));
    if (payment.status === "approved") {
      const order = await getOrder(env, String(payment.external_reference));
      if (order) {
        const notification = sendPaymentApprovedWhatsApp(env, order).catch(error => {
          console.error("ORLA WhatsApp background error", { order_id: order.id, error: error?.message });
        });
        if (context.ctx?.waitUntil) context.ctx.waitUntil(notification);
        else if (context.waitUntil) context.waitUntil(notification);
        else await notification;
      }
    }
  }
  console.log("ORLA payment update", {
    payment_id: payment.id,
    status: payment.status,
    external_reference: payment.external_reference,
  });
  return json({ received: true });
}
import { getOrder, updatePayment } from "../_lib/orders-db.js";
import { sendPaymentApprovedWhatsApp } from "../_lib/whatsapp.js";
import { updateReservationPayment } from "../_lib/inventory-reservations.js";
