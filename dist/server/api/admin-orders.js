import { getOrder, listOrders, scanOrderItem, updateOrder } from "../_lib/orders-db.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export function adminUser(request, env) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = (request.headers.get("oai-authenticated-user-email") || "").toLowerCase();
  if (!id) return null;
  const allowed = String(env.ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return null;
  return { id, email, name: request.headers.get("oai-authenticated-user-full-name") || email };
}

export async function handleAdminOrders({ request, env, pathname }) {
  const user = adminUser(request, env);
  if (!user) return json({ error: "Acesso administrativo não autorizado.", signin: "/signin-with-chatgpt?return_to=/admin.html" }, 401);
  try {
    const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)(?:\/(scan))?$/);
    if (request.method === "GET" && pathname === "/api/admin/orders") return json({ orders: await listOrders(env), user });
    if (request.method === "GET" && match && !match[2]) {
      const order = await getOrder(env, decodeURIComponent(match[1]));
      return order ? json({ order, user }) : json({ error: "Pedido não encontrado." }, 404);
    }
    if (request.method === "PATCH" && match && !match[2]) {
      const order = await updateOrder(env, decodeURIComponent(match[1]), await request.json(), user.email || user.id);
      return order ? json({ order }) : json({ error: "Pedido não encontrado." }, 404);
    }
    if (request.method === "POST" && match?.[2] === "scan") {
      const body = await request.json();
      const order = await scanOrderItem(env, decodeURIComponent(match[1]), String(body.barcode || "").trim(), user.email || user.id);
      return order ? json({ order }) : json({ error: "Pedido não encontrado." }, 404);
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) {
    return json({ error: error?.message || "Não foi possível atualizar o pedido." }, 400);
  }
}
