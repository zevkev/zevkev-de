// Price formatting for the shop. js/fourthwall-api.js requests every price
// in EUR directly from Fourthwall (currency=EUR), so nothing is converted
// here. Amounts are rounded to whole cents before formatting and summing, so
// float noise (0.1 + 0.2) never shows up in a subtotal.
const formatters = new Map();

function formatter(currency) {
  const key = currency || "EUR";
  if (!formatters.has(key)) {
    try {
      formatters.set(key, new Intl.NumberFormat("de-DE", { style: "currency", currency: key }));
    } catch {
      formatters.set(key, null);
    }
  }
  return formatters.get(key);
}

export function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

export function money(amount, currency = "EUR") {
  const value = toCents(amount) / 100;
  const fmt = formatter(currency);
  return fmt ? fmt.format(value) : `${value.toFixed(2).replace(".", ",")} ${currency || "EUR"}`;
}
