// Shared price formatter, used by catalog.js, product.js and cart.js
// everywhere a price is shown. js/fourthwall-api.js requests every price
// directly in EUR from Fourthwall's own Storefront API (currency=EUR query
// param) -- Fourthwall does the USD->EUR conversion on their end using the
// same rate their hosted checkout actually charges, so there's no separate
// client-side conversion to keep in sync with it here anymore.
function format(amount, currency) {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`;
  }
}

export function money(amount, currency) {
  return format(amount, currency);
}
