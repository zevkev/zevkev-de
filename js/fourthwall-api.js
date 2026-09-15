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

export const FourthwallAPI = {
  getCollections: () => request("/collections?per_page=50"),
  getCollectionProducts: (slug) => request(`/collections/${encodeURIComponent(slug)}/products?per_page=100`),
  getProduct: (slug) => request(`/products/${encodeURIComponent(slug)}`),
  createCart: (items = []) => request("/carts", { method: "POST", body: JSON.stringify({ items }) }),
  getCart: (cartId) => request(`/carts/${cartId}`),
  updateCart: (cartId, items) => request(`/carts/${cartId}/items`, { method: "PUT", body: JSON.stringify({ items }) }),
};
