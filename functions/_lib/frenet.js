export const FREE_SHIPPING_MINIMUM = 500;
const FRENET_FALLBACK_ORIGIN = "https://orla-loja-preview.pages.dev";

const WEIGHT_KG = {
  Top: 0.080,
  Tanga: 0.060,
  "Maiô": 0.150,
  Saída: 0.110,
};

export function packageFor(items) {
  const weight = items.reduce((total, item) => {
    return total + (WEIGHT_KG[item.category] || 0.100) * item.quantity;
  }, 0);
  return {
    Height: 10,
    Width: 15,
    Length: 35,
    Weight: Math.max(0.1, Number(weight.toFixed(3))),
    Quantity: 1,
    SKU: "ORLA-PEDIDO",
  };
}

export async function quoteFrenet({ env, recipientCep, subtotal, items, serviceCode }) {
  if (!env.FRENET_TOKEN || !env.FRENET_SELLER_CEP) {
    const response = await fetch(`${FRENET_FALLBACK_ORIGIN}/api/shipping-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipientCep: String(recipientCep).replace(/\D/g, ""),
        items: items.map(item => ({ sku: item.sku, quantity: item.quantity })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.options)) {
      throw new Error(data.error || "A cotacao de frete nao respondeu no momento.");
    }
    const options = data.options.map(option => ({
      code: String(option.code || ""),
      carrier: String(option.carrier || "Transportadora"),
      name: String(option.name || "Entrega"),
      price: Number(option.price),
      deliveryTime: Number(option.deliveryTime || 0),
    })).filter(option => option.code && Number.isFinite(option.price));
    return serviceCode ? options.filter(option => option.code === String(serviceCode)) : options;
  }
  const payload = {
    SellerCEP: String(env.FRENET_SELLER_CEP).replace(/\D/g, ""),
    RecipientCEP: String(recipientCep).replace(/\D/g, ""),
    ShipmentInvoiceValue: Number(subtotal.toFixed(2)),
    RecipientCountry: "BR",
    ShippingItemArray: [packageFor(items)],
  };
  if (serviceCode) payload.ShippingServiceCode = serviceCode;

  const response = await fetch("https://api.frenet.com.br/shipping/quote", {
    method: "POST",
    headers: { token: env.FRENET_TOKEN, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("A Frenet nao respondeu a cotacao.");
  const data = await response.json();
  const services = data.ShippingSevicesArray || data.ShippingServicesArray || data.services || data.Services || [];
  return services
    .filter(service => !service.Error && Number.isFinite(Number(service.ShippingPrice)))
    .map(service => ({
      code: String(service.ServiceCode || ""),
      carrier: String(service.Carrier || "Transportadora"),
      name: String(service.ServiceDescription || service.ServiceName || "Entrega"),
      price: Number(service.ShippingPrice),
      deliveryTime: Number(service.DeliveryTime || 0),
    }))
    .filter(service => service.code);
}
