import { hasCompletedOrder } from "../_lib/orders-db.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
const digits = value => String(value || "").replace(/\D/g, "");

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (normalize(body.code) !== "PRIMEIRA COMPRA") return json({ valid: false, error: "Cupom não encontrado." }, 404);
    if (!body.email || digits(body.cpf).length !== 11) return json({ valid: false, error: "Informe e-mail e CPF para validar o cupom." }, 400);
    if (await hasCompletedOrder(env, body.email, body.cpf)) return json({ valid: false, error: "Este cupom é exclusivo para a primeira compra." }, 409);
    return json({ valid: true, code: "PRIMEIRA COMPRA", label: "Primeira Compra", discountPercent: 15 });
  } catch (error) {
    return json({ valid: false, error: error?.message || "Não foi possível validar o cupom." }, 400);
  }
}
