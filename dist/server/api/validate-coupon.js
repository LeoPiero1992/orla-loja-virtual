const COUPONS = new Set(["LUCIANA10", "NATALIA10", "DEBORA10", "SHEILA10"]);

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const code = String(body?.code || "").trim().toUpperCase();
    if (!COUPONS.has(code)) return json({ valid: false, error: "Cupom não encontrado." }, 404);
    return json({ valid: true, code, discountPercent: 10 });
  } catch (error) {
    return json({ valid: false, error: "Não foi possível validar o cupom." }, 400);
  }
}
