import { getCustomerOrder } from "../_lib/orders-db.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const cleanOrder = order => ({
  id: order.id,
  created_at: order.created_at,
  updated_at: order.updated_at,
  customer_name: order.customer_name,
  address: order.address,
  collection: order.collection,
  payment_method: order.payment_method,
  payment_status: order.payment_status,
  carrier: order.carrier,
  shipping_service: order.shipping_service,
  shipping_deadline: order.shipping_deadline,
  tracking_code: order.tracking_code,
  freight: order.freight,
  subtotal: order.subtotal,
  total: order.total,
  status: order.status,
  items: order.items.map(item => ({
    sku: item.sku,
    ref: item.ref,
    name: item.name,
    category: item.category,
    collection: item.collection,
    color: item.color,
    size: item.size,
    quantity: item.quantity,
    unit_price: item.unit_price,
    image: item.image,
  })),
  events: order.events.map(event => ({
    event_type: event.event_type,
    description: event.description,
    created_at: event.created_at,
  })),
});

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const id = String(body.orderId || "").trim().toUpperCase();
    const email = String(body.email || "").trim();
    const cpf = String(body.cpf || "").replace(/\D/g, "");
    if (!id || !email || cpf.length !== 11) {
      return json({ error: "Informe o número do pedido, o e-mail e o CPF usados na compra." }, 400);
    }
    const order = await getCustomerOrder(env, id, email, cpf);
    if (!order) return json({ error: "Pedido não encontrado. Confira os dados informados." }, 404);
    return json({ order: cleanOrder(order) });
  } catch (error) {
    return json({ error: error?.message || "Não foi possível consultar o pedido." }, 400);
  }
}
