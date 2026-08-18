import { FREE_SHIPPING_MINIMUM, quoteFrenet } from "../_lib/frenet.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const digits = value => String(value || "").replace(/\D/g, "");

async function loadData(env, origin, filename, prefix) {
  const response = await env.ASSETS.fetch(`${origin}/${filename}`);
  if (!response.ok) throw new Error("Nao foi possivel consultar o catalogo.");
  const source = await response.text();
  return JSON.parse(source.slice(source.indexOf(prefix) + prefix.length).trim().replace(/;\s*$/, ""));
}

function buildCatalog(products, stock) {
  const catalog = new Map();
  for (const product of products) for (const variant of product.variants || []) for (const size of variant.sizes || []) {
    const sku = `${product.ref}${variant.code}${size}`;
    const basePrice = Number(variant.price);
    const effectivePrice = basePrice;
    catalog.set(sku, { sku, category: product.category, price: effectivePrice, available: Number(stock[sku] || 0) });
  }
  return catalog;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const recipientCep = digits(body.recipientCep);
    if (recipientCep.length !== 8) return json({ error: "Informe um CEP valido." }, 400);
    const requested = Array.isArray(body.items) ? body.items : [];
    if (!requested.length) return json({ error: "A sacola esta vazia." }, 400);

    const url = new URL(request.url);
    const [products, stock] = await Promise.all([
      loadData(env, url.origin, "products-data.js", "window.ORLA_STORE_PRODUCTS="),
      loadData(env, url.origin, "stock-data.js", "window.ORLA_STORE_STOCK="),
    ]);
    const catalog = buildCatalog(products, stock);
    const items = requested.map(item => {
      const official = catalog.get(String(item.sku || ""));
      const quantity = Math.trunc(Number(item.quantity || 0));
      if (!official || quantity < 1 || quantity > official.available) throw new Error("Confira os itens da sacola.");
      return { ...official, quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (subtotal >= FREE_SHIPPING_MINIMUM) {
      return json({ freeShipping: true, options: [{ code: "FREE", carrier: "ORLA", name: "Frete grátis", price: 0, deliveryTime: 0 }] });
    }
    const options = await quoteFrenet({ env, recipientCep, subtotal, items });
    if (!options.length) return json({ error: "Nenhuma opcao de entrega foi encontrada para este CEP." }, 404);
    return json({ freeShipping: false, options });
  } catch (error) {
    return json({ error: error?.message || "Nao foi possivel calcular o frete." }, 400);
  }
}
