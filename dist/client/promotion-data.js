(function () {
  const products = window.ORLA_STORE_PRODUCTS || [];

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
    discount: 0,
    isPromotional: () => false,
  };
})();
