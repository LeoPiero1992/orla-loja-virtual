import { FREE_SHIPPING_MINIMUM, quoteFrenet } from "../_lib/frenet.js";
import { createOrder, hasCompletedOrder } from "../_lib/orders-db.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const digits = value => String(value || "").replace(/\D/g, "");
const normalizeCoupon = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
const AFLORE_DISCOUNT = 0.30;

async function loadStoreData(env, origin, filename, prefix) {
  const response = await env.ASSETS.fetch(`${origin}/${filename}`);
  if (!response.ok) throw new Error(`Nao foi possivel carregar ${filename}.`);
  const source = await response.text();
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Formato invalido em ${filename}.`);
  const raw = source.slice(start + prefix.length).trim().replace(/;\s*$/, "");
  return JSON.parse(raw);
}

function buildCatalog(products, stock) {
  const catalog = new Map();
  for (const product of products) {
    for (const variant of product.variants || []) {
      for (const size of variant.sizes || []) {
        const sku = `${product.ref}${variant.code}${size}`;
        const basePrice = Number(variant.price);
        const effectivePrice = product.collection === "06"
          ? Math.round(basePrice * (1 - AFLORE_DISCOUNT) * 100) / 100
          : basePrice;
        catalog.set(sku, {
          sku,
          ref: product.ref,
          name: product.name,
          category: product.category,
          color: variant.color,
          size,
          price: effectivePrice,
          available: Number(stock[sku] || 0),
          collection: product.collection || "",
          image: variant.img ? `https://drive.google.com/thumbnail?id=${variant.img}&sz=w800` : "",
        });
      }
    }
  }
  return catalog;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
      return json({ error: "O pagamento ainda nao foi ativado no servidor." }, 503);
    }

    const body = await request.json();
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};
    if (!requestedItems.length) return json({ error: "A sacola esta vazia." }, 400);
    if (!customer.nome || !customer.email || digits(customer.cpf).length !== 11) {
      return json({ error: "Confira os dados do cliente antes de continuar." }, 400);
    }

    const url = new URL(request.url);
    const [products, stock] = await Promise.all([
      loadStoreData(env, url.origin, "products-data.js", "window.ORLA_STORE_PRODUCTS="),
      loadStoreData(env, url.origin, "stock-data.js", "window.ORLA_STORE_STOCK="),
    ]);
    const catalog = buildCatalog(products, stock);
    const validatedItems = requestedItems.map(item => {
      const sku = String(item.sku || "");
      const quantity = Math.max(0, Math.trunc(Number(item.quantity || 0)));
      const official = catalog.get(sku);
      if (!official || quantity < 1) throw new Error("Existe um item invalido na sacola.");
      if (quantity > official.available) throw new Error(`${official.name} nao possui essa quantidade em estoque.`);
      return { ...official, quantity };
    });
    const couponCode = normalizeCoupon(body.couponCode);
    let discountPercent = 0;
    if (couponCode) {
      if (couponCode !== "PRIMEIRA COMPRA") return json({ error: "Cupom não encontrado." }, 404);
      if (await hasCompletedOrder(env, customer.email, customer.cpf)) return json({ error: "Este cupom é exclusivo para a primeira compra." }, 409);
      discountPercent = 15;
    }
    const orderItems = validatedItems.map(item => ({ ...item, price: Math.round(item.price * (1 - discountPercent / 100) * 100) / 100 }));
    const items = orderItems.map(official => {
      return {
        id: official.sku,
        title: `${official.name} - ${official.color} - ${official.size}`.slice(0, 250),
        description: `ORLA Ref. ${official.ref.slice(0, 3)} | ${official.color} | ${official.size}`,
        category_id: "fashion",
        currency_id: "BRL",
        quantity: official.quantity,
        unit_price: official.price,
      };
    });

    const originalSubtotal = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    let shipping = { code: "FREE", carrier: "ORLA", name: "Frete gratis", price: 0, deliveryTime: 0 };
    if (originalSubtotal < FREE_SHIPPING_MINIMUM) {
      const requestedService = String(body.shippingServiceCode || "");
      if (!requestedService) return json({ error: "Escolha uma opcao de frete antes de continuar." }, 409);
      const options = await quoteFrenet({
        env,
        recipientCep: customer.cep,
        subtotal: originalSubtotal,
        items: orderItems,
        serviceCode: requestedService,
      });
      shipping = options.find(option => option.code === requestedService);
      if (!shipping) return json({ error: "A opcao de frete escolhida nao esta mais disponivel. Calcule novamente." }, 409);
    }

    const paymentTotal = subtotal + Number(shipping.price || 0);
    const maximumInstallments = Math.max(1, Math.min(12, Math.floor(paymentTotal / 100)));
    const nameParts = String(customer.nome).trim().split(/\s+/);
    const phone = digits(customer.telefone);
    const orderId = `ORLA-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const preference = {
      items,
      external_reference: orderId,
      statement_descriptor: "ORLA",
      payer: {
        name: nameParts.shift() || "Cliente",
        surname: nameParts.join(" ") || "ORLA",
        email: String(customer.email).trim(),
        identification: { type: "CPF", number: digits(customer.cpf) },
        phone: { area_code: phone.slice(0, 2), number: phone.slice(2) },
        address: {
          zip_code: digits(customer.cep),
          street_name: String(customer.rua || ""),
          street_number: Number(digits(customer.numero)) || 0,
        },
      },
      shipments: {
        mode: "not_specified",
        cost: shipping.price,
        receiver_address: {
          zip_code: digits(customer.cep),
          street_name: String(customer.rua || ""),
          street_number: Number(digits(customer.numero)) || 0,
          apartment: String(customer.complemento || ""),
          city_name: String(customer.cidade || ""),
          state_name: String(customer.estado || ""),
        },
      },
      payment_methods: { installments: maximumInstallments },
      metadata: {
        order_id: orderId,
        customer_phone: phone,
        shipping_code: shipping.code,
        shipping_carrier: shipping.carrier,
        shipping_service: shipping.name,
        shipping_days: shipping.deliveryTime,
        coupon_code: couponCode,
        discount_percent: discountPercent,
        original_subtotal: originalSubtotal,
      },
    };

    const requestedStoreOrigin = String(request.headers.get("x-store-origin") || "").replace(/\/$/, "");
    const storeOrigin = requestedStoreOrigin === "https://lojaorla.com.br" ? requestedStoreOrigin : url.origin;
    const isPublicHttps = storeOrigin.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(storeOrigin);
    if (isPublicHttps) {
      preference.back_urls = {
        success: `${storeOrigin}/pagamento.html?resultado=sucesso`,
        pending: `${storeOrigin}/pagamento.html?resultado=pendente`,
        failure: `${storeOrigin}/pagamento.html?resultado=falha`,
      };
      preference.auto_return = "approved";
      preference.notification_url = `${url.origin}/api/payment-webhook`;
    }

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
        "content-type": "application/json",
        "x-idempotency-key": orderId,
      },
      body: JSON.stringify(preference),
    });
    const mpData = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("Mercado Pago preference error", mpResponse.status, mpData?.message);
      return json({ error: "Nao foi possivel iniciar o pagamento. Tente novamente." }, 502);
    }

    const checkoutUrl = env.MERCADO_PAGO_ENV === "production"
      ? mpData.init_point
      : (mpData.sandbox_init_point || mpData.init_point);
    await createOrder(env, {
      id: orderId,
      customer: {
        nome: String(customer.nome).trim(), cpf: digits(customer.cpf), telefone: phone,
        email: String(customer.email).trim(),
      },
      address: {
        cep: digits(customer.cep), rua: String(customer.rua || ""), numero: String(customer.numero || ""),
        bairro: String(customer.bairro || ""), complemento: String(customer.complemento || ""),
        cidade: String(customer.cidade || ""), estado: String(customer.estado || ""),
      },
      items: orderItems,
      shipping,
      subtotal,
      total: subtotal + Number(shipping.price || 0),
      preferenceId: String(mpData.id || ""),
    });
    return json({ checkoutUrl, orderId });
  } catch (error) {
    return json({ error: error?.message || "Nao foi possivel iniciar o pagamento." }, 400);
  }
}
