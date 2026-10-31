// Thin client for the Fourthwall Storefront API. Uses only the public
// storefront token (product reads and carts), never admin credentials.
// Docs: https://docs.fourthwall.com/reference/storefront-api
//
// Verified against the live API:
// - Prices: every request asks for currency=EUR, so Fourthwall converts with
//   the same rate its hosted checkout charges. No conversion happens here.
// - Paging: the API ignores per_page. The real params are page (0 based) and
//   size, and the default page size is 10, so lists are fetched page by page
//   until paging.hasNextPage is false.
// - Carts: Fourthwall rejects PUT/PATCH/DELETE at its edge (a 403 without
//   CORS headers, which the browser reports as a CORS error). Cart changes
//   use the POST endpoints, each returning the full updated cart:
//     POST /carts                 { items: [{ variantId, quantity }] }  new cart
//     POST /carts/{id}/add        { items: [{ variantId, quantity }] }  adds or increments a line
//     POST /carts/{id}/change     { items: [{ variantId, quantity }] }  sets a line's quantity
//     POST /carts/{id}/remove     { items: [{ variantId }] }            drops a line
//   An unknown or expired cart id answers 404 with code CART_NOT_FOUND.
import { FOURTHWALL_STOREFRONT_TOKEN } from "/js/config.js";

const BASE = "https://storefront-api.fourthwall.com/v1";
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

export class FourthwallError extends Error {
  constructor(status, path, body) {
    super(`Fourthwall API ${status} on ${path}`);
    this.name = "FourthwallError";
    this.status = status;
    this.code = body?.code || null;
  }
}

async function request(path, { params = {}, body } = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set("storefront_token", FOURTHWALL_STOREFRONT_TOKEN);
  url.searchParams.set("currency", "EUR");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  // Content-Type only when there is a body: a plain GET then stays a
  // "simple" CORS request and skips the preflight round trip.
  const init = body === undefined
    ? { method: "GET" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };

  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new FourthwallError(res.status, path, data);
  }
  return res.json();
}

async function getAllPages(path) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await request(path, { params: { page, size: PAGE_SIZE } });
    all.push(...(data.results || []));
    if (!data.paging?.hasNextPage) break;
  }
  return all;
}

export const FourthwallAPI = {
  getCollections: () => getAllPages("/collections"),
  getCollectionProducts: (slug) => getAllPages(`/collections/${encodeURIComponent(slug)}/products`),
  getProduct: (slug) => request(`/products/${encodeURIComponent(slug)}`),

  createCart: (items) => request("/carts", { body: { items } }),
  getCart: (cartId) => request(`/carts/${encodeURIComponent(cartId)}`),
  addToCart: (cartId, items) => request(`/carts/${encodeURIComponent(cartId)}/add`, { body: { items } }),
  changeCart: (cartId, items) => request(`/carts/${encodeURIComponent(cartId)}/change`, { body: { items } }),
  removeFromCart: (cartId, variantIds) =>
    request(`/carts/${encodeURIComponent(cartId)}/remove`, { body: { items: variantIds.map((variantId) => ({ variantId })) } }),
};

// ---------- Helpers for the product data shape ----------
// A variant looks like { id, unitPrice: { value, currency }, compareAtPrice,
// stock: { type: "UNLIMITED" } | { type: "LIMITED", quantity }, images: [...],
// attributes: { description: "White, S", color: { name, swatch }, size: { name } } }.
// Every variant carries its own images, identical across the sizes of one
// color and different between colors.

export function variantInStock(variant) {
  if (!variant) return false;
  return !(variant.stock?.type === "LIMITED" && (variant.stock.quantity ?? 0) <= 0);
}

export function productSoldOut(product) {
  if (product?.state?.type === "SOLD_OUT") return true;
  const variants = product?.variants || [];
  return variants.length > 0 && !variants.some(variantInStock);
}

export function variantOnSale(variant) {
  const price = variant?.unitPrice?.value;
  const compareAt = variant?.compareAtPrice?.value;
  return price != null && compareAt != null && compareAt > price;
}

// Cheapest variant (preferring ones in stock) plus whether prices differ, so
// a card can say "ab 19,17 €" when sizes are priced differently.
export function priceSummary(product) {
  const variants = product?.variants || [];
  const pool = variants.some(variantInStock) ? variants.filter(variantInStock) : variants;
  let cheapest = null;
  for (const v of pool) {
    if (!cheapest || (v.unitPrice?.value ?? Infinity) < (cheapest.unitPrice?.value ?? Infinity)) cheapest = v;
  }
  const values = new Set(pool.map((v) => v.unitPrice?.value));
  return { variant: cheapest, varies: values.size > 1 };
}

// Images of the first variant with the given color (falls back to the
// product's own images when the product has no color or no variant images).
export function imagesForColor(product, colorName) {
  if (colorName != null) {
    const variant = (product?.variants || []).find((v) => v.attributes?.color?.name === colorName && v.images?.length);
    if (variant) return variant.images;
  }
  if (product?.images?.length) return product.images;
  return product?.image ? [product.image] : [];
}

// Unique colors in variant order: [{ name, swatch }].
export function productColors(product) {
  const seen = new Map();
  for (const v of product?.variants || []) {
    const c = v.attributes?.color;
    if (c?.name != null && !seen.has(c.name)) seen.set(c.name, { name: c.name, swatch: c.swatch || null });
  }
  return [...seen.values()];
}
