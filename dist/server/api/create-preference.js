const ORDER_BACKEND = "https://orla-loja-preview.pages.dev";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestPost({ request }) {
  try {
    const response = await fetch(`${ORDER_BACKEND}/api/create-preference`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-store-origin": "https://lojaorla.com.br" },
      body: await request.text(),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return json({ error: "Nao foi possivel conectar o pagamento ao painel de pedidos." }, 502);
  }
}
