const ORDER_BACKEND = "https://orla-loja-preview.pages.dev";

export async function onRequestPost({ request }) {
  try {
    const response = await fetch(`${ORDER_BACKEND}/api/validate-coupon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Nao foi possivel validar o cupom." }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
