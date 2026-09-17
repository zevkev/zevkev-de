// Shared USD -> EUR display-conversion helper, used by catalog.js,
// product.js and cart.js everywhere a price is shown. Fourthwall's
// Storefront API always returns prices in USD — there is no account
// setting that changes that (see CLAUDE.md) — so this converts using a
// rate fetched periodically by scripts/fetch-exchange-rate.mjs into
// /assets/data/exchange-rate.json.
//
// This is display-only. It has no effect on what a customer is actually
// charged — that's a separate, already-handled concern in js/cart.js's
// checkoutUrl(), which passes cartCurrency=EUR to Fourthwall's own hosted
// checkout (confirmed working by loading that checkout URL directly and
// comparing the displayed order-summary currency for cartCurrency=USD vs
// EUR against a real test cart).
const RATE_URL = "/assets/data/exchange-rate.json";

let cachedRate = null;

// Fetched once per page load (module singleton — every importer shares this
// one promise/fetch instead of firing one request per money() call).
const ready = fetch(RATE_URL, { cache: "no-store" })
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    cachedRate = typeof data?.usdToEur === "number" && Number.isFinite(data.usdToEur) ? data.usdToEur : null;
    return cachedRate;
  })
  .catch(() => {
    // Missing file (e.g. local dev before the data-refresh workflow has
    // ever run), network error, bad JSON — any of these just mean "no rate
    // yet". cachedRate stays null and money() below falls back to showing
    // the original USD amount rather than crashing.
    cachedRate = null;
    return null;
  });

function format(amount, currency) {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`;
  }
}

// Promise callers can await once at page/render startup (see catalog.js's
// loadCatalog() and product.js's init()) so the very first paint already
// has the rate, instead of a flash of USD before it arrives. Resolves
// almost immediately in practice — it's a small same-origin JSON file, no
// slower than the page's own CSS/JS — but never rejects, so awaiting it is
// always safe even if the file is missing.
export { ready };

// Async convert-then-return-a-number helper, for call sites that want the
// raw converted amount rather than a formatted string.
export async function toEUR(usdAmount) {
  await ready;
  return cachedRate ? usdAmount * cachedRate : usdAmount;
}

// Drop-in replacement for the old per-file `money(amount, currency)`
// formatter — converts USD to EUR before formatting when a rate is
// available, otherwise falls back to formatting the original amount/
// currency exactly like the old helper did (so a missing/failed rate fetch
// degrades to "shows USD" rather than breaking price display).
export function money(amount, currency) {
  if (cachedRate != null && (!currency || currency === "USD")) {
    return format(amount * cachedRate, "EUR");
  }
  return format(amount, currency);
}
