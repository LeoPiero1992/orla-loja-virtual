import { onRequestPost as createPreference } from "./api/create-preference.js";
import { onRequestPost as paymentWebhook } from "./api/payment-webhook.js";
import { onRequestPost as shippingQuote } from "./api/shipping-quote.js";
import { handleAdminOrders, adminUser } from "./api/admin-orders.js";
import { onRequestPost as customerOrder } from "./api/customer-order.js";
import { onRequestPost as validateCoupon } from "./api/validate-coupon.js";
import { onRequestGet as addressByCep } from "./api/address-by-cep.js";
import { onRequestDelete as releaseCart, onRequestGet as cartAvailability, onRequestPost as reserveCart } from "./api/cart-reservation.js";

const notFound = () => new Response("Not found", { status: 404 });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    if (request.method === "POST" && url.pathname === "/api/create-preference") {
      return createPreference(context);
    }
    if (request.method === "POST" && url.pathname === "/api/payment-webhook") {
      return paymentWebhook(context);
    }
    if (request.method === "POST" && url.pathname === "/api/shipping-quote") {
      return shippingQuote(context);
    }
    if (request.method === "GET" && url.pathname === "/api/address-by-cep") {
      return addressByCep(context);
    }
    if (url.pathname.startsWith("/api/admin/orders")) {
      return handleAdminOrders({ ...context, pathname: url.pathname });
    }
    if (request.method === "POST" && url.pathname === "/api/customer/order") {
      return customerOrder(context);
    }
    if (request.method === "POST" && url.pathname === "/api/validate-coupon") {
      return validateCoupon(context);
    }
    if (url.pathname === "/api/cart-reservation") {
      if (request.method === "GET") return cartAvailability(context);
      if (request.method === "POST") return reserveCart(context);
      if (request.method === "DELETE") return releaseCart(context);
    }
    if ((url.pathname === "/admin" || url.pathname === "/admin.html") && !adminUser(request, env)) {
      return Response.redirect(`${url.origin}/signin-with-chatgpt?return_to=/admin.html`, 302);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return notFound();
    return env.ASSETS.fetch(request);
  },
};
