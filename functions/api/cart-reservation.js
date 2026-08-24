import { inventoryForSession, reserveCart } from "../_lib/inventory-reservations.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const data = await inventoryForSession(env, url.origin, url.searchParams.get("sessionId") || "");
    return json(data);
  } catch (error) {
    return json({ error: error?.message || "Não foi possível consultar o estoque." }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const url = new URL(request.url);
    return json(await reserveCart(env, url.origin, body?.sessionId, body?.items));
  } catch (error) {
    return json({ error: error?.message || "Não foi possível reservar a sacola." }, 409);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json();
    const url = new URL(request.url);
    return json(await reserveCart(env, url.origin, body?.sessionId, []));
  } catch (error) {
    return json({ error: error?.message || "Não foi possível liberar a sacola." }, 400);
  }
}

