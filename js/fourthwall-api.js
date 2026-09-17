// Thin client for the Fourthwall Storefront API (public read + cart-creation
// token only — never the admin/HMAC credentials from Fourthwall settings).
// Docs: https://docs.fourthwall.com/reference/storefront-api
import { FOURTHWALL_STOREFRONT_TOKEN } from "./config.js";

const BASE = "https://storefront-api.fourthwall.com/v1";

async function request(path, opts = {}) {
  if (!FOURTHWALL_STOREFRONT_TOKEN) {
    throw new Error("FOURTHWALL_STOREFRONT_TOKEN is not set in js/config.js");
  }
  const url = new URL(BASE + path);
  url.searchParams.set("storefront_token", FOURTHWALL_STOREFRONT_TOKEN);
  // Fourthwall's Storefront API accepts a `currency` param on product/
  // collection/cart endpoints and returns prices pre-converted using
  // THEIR OWN rate -- the same rate their hosted checkout actually charges.
  // Previously this site fetched USD prices and converted them itself using
  // a separately-fetched ECB rate (js/currency.js), which could drift from
  // Fourthwall's own conversion and show a different price than checkout
  // actually charged. Requesting EUR directly here guarantees the two
  // always match, since there's only one conversion happening now, not two.
  // This site is exclusively for a German audience (see checkoutUrl() in
  // js/cart.js), so EUR is always correct.
  url.searchParams.set("currency", "EUR");
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fourthwall API ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

// The Storefront API has no single "replace cart contents" endpoint, and PUT/PATCH/DELETE
// are rejected outright at Fourthwall's edge — a blanket 403 with no CORS headers at all,
// regardless of path (verified against /carts/{id}, /carts/{id}/items, and unrelated
// GET-only routes, both via curl and Node's fetch, so it's not a routing mistake or a
// client-fingerprinting fluke). That 403-with-no-CORS-headers is exactly what the browser
// reports as a CORS error on PUT. The real API is action-based and POST-only:
//   POST /carts/{id}/add    { items: [{ variantId, quantity }] }  adds a line or increments its quantity
//   POST /carts/{id}/change { items: [{ variantId, quantity }] }  sets a line's quantity outright; lines not listed are left alone
//   POST /carts/{id}/remove { items: [{ variantId }] }            drops a line entirely (no quantity needed)
// All three return the full updated cart, same shape as GET /carts/{id}.
//
// updateCart(cartId, items) keeps its original "here is the full desired item list"
// contract (js/cart.js's itemsForUpdate() still builds that full list) by diffing it
// against the live cart and issuing only the add/change/remove calls needed to match it,
// so no call sites in cart.js need to change.
async function updateCart(cartId, items) {
  const current = await request(`/carts/${cartId}`);
  const currentQty = new Map(current.items.map((it) => [it.variant.id, it.quantity]));
  const desiredIds = new Set(items.map((it) => it.variantId));

  const toRemove = [...currentQty.keys()].filter((id) => !desiredIds.has(id));
  const toAdd = items.filter((it) => !currentQty.has(it.variantId));
  const toChange = items.filter((it) => currentQty.has(it.variantId) && currentQty.get(it.variantId) !== it.quantity);

  let cart = current;
  if (toRemove.length) {
    cart = await request(`/carts/${cartId}/remove`, {
      method: "POST",
      body: JSON.stringify({ items: toRemove.map((variantId) => ({ variantId })) }),
    });
  }
  if (toAdd.length) {
    cart = await request(`/carts/${cartId}/add`, {
      method: "POST",
      body: JSON.stringify({ items: toAdd }),
    });
  }
  if (toChange.length) {
    cart = await request(`/carts/${cartId}/change`, {
      method: "POST",
      body: JSON.stringify({ items: toChange }),
    });
  }
  return cart;
}

export const FourthwallAPI = {
  getCollections: () => request("/collections?per_page=50"),
  getCollectionProducts: (slug) => request(`/collections/${encodeURIComponent(slug)}/products?per_page=100`),
  getProduct: (slug) => request(`/products/${encodeURIComponent(slug)}`),
  createCart: (items = []) => request("/carts", { method: "POST", body: JSON.stringify({ items }) }),
  getCart: (cartId) => request(`/carts/${cartId}`),
  updateCart,
};
