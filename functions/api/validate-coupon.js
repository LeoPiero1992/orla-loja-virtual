const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
const COUPONS = new Set(["LUCIANA10", "NATALIA10", "DEBORA10", "SHEILA10"]);
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const code = normalize(body.code);
    if (!COUPONS.has(code)) return json({ valid: false, error: "Cupom não encontrado." }, 404);
    return json({ valid: true, code, label: code, discountPercent: 10 });
  } catch (error) {
    return json({ valid: false, error: error?.message || "Não foi possível validar o cupom." }, 400);
  }
}
