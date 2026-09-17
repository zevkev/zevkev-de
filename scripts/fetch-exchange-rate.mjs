// Fetches the current USD -> EUR exchange rate from Frankfurter (a free,
// keyless exchange-rate API backed by the European Central Bank's daily
// reference rates: https://frankfurter.dev — verified response shape:
// { "amount": 1.0, "base": "USD", "date": "2026-09-16", "rates": { "EUR": 0.86678 } })
// and writes assets/data/exchange-rate.json.
//
// WHY THIS EXISTS: see CLAUDE.md's (former) "Deliberately deferred" note —
// Fourthwall's Storefront API always returns prices in USD, with no setting
// that changes that. js/currency.js reads the file this script writes to
// convert USD amounts to EUR for on-site display (checkout currency is a
// separate, already-solved concern — see js/cart.js's checkoutUrl()).
//
// Defensive by design, same pattern as scripts/fetch-main-feed.mjs: if the
// fetch fails, doesn't parse, or returns an implausible number, this throws
// WITHOUT writing anything. The workflow step that runs this is marked
// continue-on-error: true, so a bad run just skips this step and leaves the
// last committed exchange-rate.json — a real, previously-fetched rate — in
// place instead of overwriting it with garbage.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "data");
const OUT_FILE = path.join(OUT_DIR, "exchange-rate.json");

async function main() {
  const res = await fetch(API_URL);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Exchange rate API ${res.status} on ${API_URL}: ${body}`);
  }
  const data = await res.json();
  const rate = data?.rates?.EUR;

  // USD/EUR has stayed roughly within 0.5-1.5 for decades — refuse anything
  // wildly outside that instead of writing a broken rate that would
  // silently show wrong prices site-wide.
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0.5 || rate > 1.5) {
    throw new Error(`Implausible USD->EUR rate from API: ${JSON.stringify(data)}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ usdToEur: rate, updatedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`Wrote USD->EUR rate ${rate} to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
