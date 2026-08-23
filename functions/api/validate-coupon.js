const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (normalize(body.code) !== "LUCIANA10") return json({ valid: false, error: "Cupom não encontrado." }, 404);
    return json({ valid: true, code: "LUCIANA10", label: "LUCIANA10", discountPercent: 10 });
  } catch (error) {
    return json({ valid: false, error: error?.message || "Não foi possível validar o cupom." }, 400);
  }
}
