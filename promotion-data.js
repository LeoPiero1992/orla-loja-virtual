(function () {
  const DISCOUNT = 0.30;
  const products = window.ORLA_STORE_PRODUCTS || [];
  const roundCurrency = value => Math.round(Number(value || 0) * 100) / 100;

  for (const product of products) {
    if (product.collection !== "06") continue;
    for (const variant of product.variants || []) {
      if (variant.originalPrice == null) variant.originalPrice = Number(variant.price || 0);
      variant.price = roundCurrency(variant.originalPrice * (1 - DISCOUNT));
    }
  }

  try {
    const cart = JSON.parse(localStorage.getItem("orla_cart") || "[]");
    let changed = false;
    for (const item of cart) {
      const product = products.find(entry => entry.ref === item.ref);
      if (!product) continue;
      const variant = (product.variants || []).find(entry =>
        item.sku === `${product.ref}${entry.code}${item.size}` || entry.color === item.color
      );
      if (!variant || Number(item.price) === Number(variant.price)) continue;
      item.price = Number(variant.price);
      changed = true;
    }
    if (changed) localStorage.setItem("orla_cart", JSON.stringify(cart));
  } catch (_) {}

  window.ORLA_AFLORE_PROMOTION = {
    discount: DISCOUNT,
    isPromotional: product => product && product.collection === "06",
  };
})();

