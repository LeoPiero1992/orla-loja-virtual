(() => {
  const CART_KEY = "orla_cart", SESSION_KEY = "orla_cart_session", START_KEY = "orla_reservation_started_at", EXPIRY_KEY = "orla_reservation_expires_at";
  const THIRTY_MINUTES = 30 * 60 * 1000, nativeFetch = window.fetch.bind(window), nativeSetItem = Storage.prototype.setItem, nativeRemoveItem = Storage.prototype.removeItem;
  const preview = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  let expiry = Number(localStorage.getItem(EXPIRY_KEY) || 0), mutationVersion = 0, timer = 0;
  const style = document.createElement("style");
  style.textContent = ".orla-reservation-status{min-height:0;padding:0 26px;color:#9e3d27;font:400 10px Montserrat,Arial,sans-serif;letter-spacing:.5px;transition:.2s}.orla-reservation-status:not(:empty){padding-top:11px;padding-bottom:11px;border-bottom:1px solid #ddd7d0}.summary>.orla-reservation-status{padding-left:0;padding-right:0}@media(max-width:520px){.orla-reservation-status{padding-left:18px;padding-right:18px}}";
  document.head.appendChild(style);
  const parseCart = value => { try { return JSON.parse(value || "[]") || []; } catch { return []; } };
  const groupedItems = cart => Object.values((Array.isArray(cart) ? cart : []).reduce((group, item) => { const sku = String(item?.sku || ""); if (!sku) return group; if (!group[sku]) group[sku] = { sku, quantity: 0 }; group[sku].quantity += Math.max(1, Number(item.quantity || 1)); return group; }, {}));
  const sessionId = () => { let value = localStorage.getItem(SESSION_KEY); if (!value) { value = `${crypto.randomUUID()}-${crypto.randomUUID()}`; nativeSetItem.call(localStorage, SESSION_KEY, value); } return value; };
  const setExpiry = value => { expiry = value ? Date.parse(value) || Number(value) || 0 : 0; if (expiry) nativeSetItem.call(localStorage, EXPIRY_KEY, String(expiry)); else nativeRemoveItem.call(localStorage, EXPIRY_KEY); updateCountdown(); };
  const reservationMessage = message => document.querySelectorAll(".orla-reservation-status").forEach(node => { node.textContent = message; });
  const ensureNotices = () => {
    const targets = [document.querySelector("#cartDrawer .drawer-head"), document.querySelector("#detailCartDrawer .detail-cart-head"), document.querySelector(".summary h2")].filter(Boolean);
    for (const target of targets) { const parent = target.parentElement; if (parent?.querySelector(":scope > .orla-reservation-status")) continue; const notice = document.createElement("div"); notice.className = "orla-reservation-status"; target.insertAdjacentElement("afterend", notice); }
  };
  const expireCart = () => { if (!parseCart(localStorage.getItem(CART_KEY)).length) return; nativeSetItem.call(localStorage, CART_KEY, "[]"); nativeRemoveItem.call(localStorage, START_KEY); setExpiry(0); reservationMessage("A reserva terminou e as peças foram liberadas."); window.dispatchEvent(new CustomEvent("orla:reservation-expired")); setTimeout(() => location.reload(), 1200); };
  const updateCountdown = () => { ensureNotices(); clearTimeout(timer); const hasCart = groupedItems(parseCart(localStorage.getItem(CART_KEY))).length > 0; if (!hasCart || !expiry) { reservationMessage(""); return; } const remaining = expiry - Date.now(); if (remaining <= 0) { expireCart(); return; } const minutes = Math.floor(remaining / 60000), seconds = Math.floor((remaining % 60000) / 1000); reservationMessage(`Peças reservadas por ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`); timer = window.setTimeout(updateCountdown, 1000); };
  const applyAvailability = payload => { if (!payload?.stock || !window.ORLA_STORE_STOCK) return; for (const key of Object.keys(window.ORLA_STORE_STOCK)) window.ORLA_STORE_STOCK[key] = 0; Object.assign(window.ORLA_STORE_STOCK, payload.stock); window.dispatchEvent(new CustomEvent("orla:stock-updated", { detail: payload })); };
  const refreshAvailability = async () => { if (preview) return null; const response = await nativeFetch(`/api/cart-reservation?sessionId=${encodeURIComponent(sessionId())}`, { headers: { accept: "application/json" }, cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível consultar o estoque."); applyAvailability(data); if (data.expiresAt) setExpiry(data.expiresAt); return data; };
  const syncItems = async (items, { markStart = true } = {}) => {
    if (!items.length) { nativeRemoveItem.call(localStorage, START_KEY); setExpiry(0); } else if (markStart) nativeSetItem.call(localStorage, START_KEY, String(Date.now()));
    if (preview) { if (items.length) setExpiry(new Date(Date.now() + THIRTY_MINUTES).toISOString()); return { reserved: true, expiresAt: expiry ? new Date(expiry).toISOString() : "" }; }
    const response = await nativeFetch("/api/cart-reservation", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sessionId: sessionId(), items }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível reservar a sacola."); setExpiry(data.expiresAt); await refreshAvailability(); return data;
  };
  const syncSerializedCart = serialized => syncItems(groupedItems(parseCart(serialized)));
  Storage.prototype.setItem = function(key, value) {
    if (this !== localStorage || key !== CART_KEY) return nativeSetItem.call(this, key, value);
    const previous = localStorage.getItem(CART_KEY) || "[]"; nativeSetItem.call(this, key, value); const currentVersion = ++mutationVersion;
    queueMicrotask(async () => { try { await syncSerializedCart(value); } catch (error) { if (currentVersion !== mutationVersion) return; nativeSetItem.call(localStorage, CART_KEY, previous); reservationMessage(error.message); alert(error.message); setTimeout(() => location.reload(), 150); } });
  };
  window.fetch = async function(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || ""; if (!url.includes("/api/create-preference")) return nativeFetch(input, init);
    const body = (() => { try { return JSON.parse(init.body || "{}"); } catch { return {}; } })(), items = Array.isArray(body.items) ? body.items : groupedItems(parseCart(localStorage.getItem(CART_KEY)));
    await syncItems(items); body.reservationSessionId = sessionId(); return nativeFetch(input, { ...init, body: JSON.stringify(body) });
  };
  const initialCart = groupedItems(parseCart(localStorage.getItem(CART_KEY))); ensureNotices();
  if (!initialCart.length) { setExpiry(0); refreshAvailability().catch(() => {}); }
  else { const started = Number(localStorage.getItem(START_KEY) || 0); if (started && Date.now() - started >= THIRTY_MINUTES && (!expiry || expiry <= Date.now())) expireCart(); else refreshAvailability().then(data => data?.expiresAt ? null : syncItems(initialCart, { markStart: !started })).catch(error => reservationMessage(error.message)); }
  window.addEventListener("orla:stock-updated", () => { if (typeof window.drawProducts === "function") window.drawProducts(); else if (typeof window.draw === "function") window.draw(); else if (typeof window.drawSummary === "function") window.drawSummary(); });
  updateCountdown();
})();
