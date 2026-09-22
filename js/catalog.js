import { FourthwallAPI } from "./fourthwall-api.js";
import { money } from "./currency.js";
import { db } from "./auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const grid = document.getElementById("product-grid");
const filterBar = document.getElementById("filter-bar");

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// One-shot query, same "minimal reads" convention as the rest of the site --
// campaigns are created rarely (see /privat/'s "Aktionen" tab), so this
// doesn't need to be live. published+dates are checked client-side rather
// than in the query itself (Firestore range queries need the inequality
// field to also be the first orderBy, and checking two date fields against
// "now" isn't expressible as one query anyway) -- the whole campaigns
// collection is expected to stay small (a handful of rows), so filtering
// the fetched set in JS is simpler and cheap.
//
// site: campaigns is now a SHARED collection with jamonhd-de (same
// Firebase project) -- filtered client-side, not via a Firestore
// where("site","==","zevkev") clause, specifically so campaigns created
// *before* this site field existed (no "site" key at all, e.g. the live
// "RELEASE" launch code) still match here instead of silently vanishing
// because a strict equality filter can never match a missing field.
async function loadCampaignBanner() {
  const el = document.getElementById("shop-campaign-banner");
  if (!el) return;
  try {
    const snap = await getDocs(query(collection(db, "campaigns"), where("published", "==", true)));
    const today = new Date().toISOString().slice(0, 10);
    const active = snap.docs
      .map((d) => d.data())
      .find((c) => (c.site ?? "zevkev") === "zevkev" && !c.endedEarly && c.startDate <= today && today <= c.endDate);
    if (!active) return;
    // Plain div, not .rip -- it now nests inside the hero card's own torn
    // shape (shop/index.html), and two stacked torn-paper edges would clip
    // against each other. css/shop.css styles it as an inset dashed-border
    // strip instead.
    el.innerHTML = `
    <div class="shop-campaign-banner">
      <span class="shop-campaign-desc">${escapeHTML(active.description)}</span>
      <span class="shop-campaign-code">Code: <strong>${escapeHTML(active.code)}</strong></span>
    </div>`;
  } catch (err) {
    console.warn("Loading campaign banner failed:", err);
  }
}
loadCampaignBanner();

function cheapestVariant(product) {
  const variants = product.variants || [];
  return variants.reduce((min, v) => (!min || (v.unitPrice?.value ?? 0) < (min.unitPrice?.value ?? 0) ? v : min), null);
}

function isSoldOut(product) {
  const variants = product.variants || [];
  if (!variants.length) return false;
  return variants.every((v) => v.stock?.type === "LIMITED" && (v.stock?.quantity ?? 0) <= 0);
}

// Small two-arrow "flip" glyph for the tap-to-flip button below -- same
// 24x24/stroke-width:2 convention as this codebase's other small icons
// (see e.g. js/vods.js's own icon helpers).
function flipIcon() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.1v-2a4 4 0 0 1 4-4h14"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 11.9v2a4 4 0 0 1-4 4H3"/></svg>`;
}

function productCardHTML(product) {
  const img = product.images?.[0]?.url || product.image?.url || "";
  // Second product photo -- most products have at least a front/back or
  // two-angle shot, and Fourthwall already returns the full `images` array
  // (same field js/product.js's own gallery reads, just taking index 1
  // instead of building a whole thumbnail strip). Falls back to nothing
  // when a product only has one photo -- both the hover CSS and the flip
  // button below only ever appear when this second <img> actually exists.
  const hoverImg = product.images?.[1]?.url || "";
  const variant = cheapestVariant(product);
  const price = variant ? money(variant.unitPrice?.value ?? 0, variant.unitPrice?.currency) : "";
  const compareAt = variant?.compareAtPrice?.value;
  const soldOut = isSoldOut(product);
  const onSale = !soldOut && compareAt != null && compareAt > (variant.unitPrice?.value ?? 0);

  return `
  <a href="#" class="product-card rip reveal" data-product-slug="${product.slug}">
    ${soldOut ? `<span class="badge-soldout">Ausverkauft</span>` : onSale ? `<span class="badge-sale">Sale</span>` : ""}
    <div class="product-photo-frame">
      ${img ? `<img src="${img}" alt="${product.name}" loading="lazy" class="product-photo-primary">` : ""}
      ${hoverImg ? `<img src="${hoverImg}" alt="" loading="lazy" class="product-photo-hover" aria-hidden="true">` : ""}
      ${hoverImg ? `<button type="button" class="product-photo-flip" aria-label="Andere Ansicht zeigen" onclick="event.preventDefault()">${flipIcon()}</button>` : ""}
    </div>
    <h3>${product.name}</h3>
    <div class="price-row">
      ${price ? `<span class="price-tag">${price}</span>` : ""}
      ${compareAt ? `<span class="price-compare">${money(compareAt, variant.unitPrice?.currency)}</span>` : ""}
    </div>
  </a>`;
}

function renderGrid(products) {
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = `<div class="empty-state"><h2>Noch keine Produkte hier</h2><p>Schau bald wieder vorbei.</p></div>`;
    return;
  }
  grid.innerHTML = products.map(productCardHTML).join("");
  // Tap-to-flip: the button's own inline onclick (in productCardHTML)
  // already stops the <a>'s default navigation, but a click still bubbles
  // up to the card's own "click" listener below (attached separately, on
  // the <a> itself) -- stopPropagation() here is what actually keeps it
  // from navigating away instead of just toggling the photo. Works
  // identically on touch (tap) and mouse (click), unlike :hover.
  grid.querySelectorAll(".product-photo-flip").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      btn.closest(".product-card")?.classList.toggle("is-flipped");
    });
  });
  grid.querySelectorAll("[data-product-slug]").forEach((card) => {
    card.addEventListener("click", (ev) => {
      ev.preventDefault();
      const slug = card.getAttribute("data-product-slug");
      // Clean URL form — served on GitHub Pages via the repo root's
      // 404.html (see js/product.js and CLAUDE.md). The older
      // /shop/product/?slug=<slug> form still works too (js/product.js
      // reads either), for any existing bookmarked/shared links.
      if (slug) location.href = `/shop/${encodeURIComponent(slug)}`;
    });
  });
  import("/js/home.js").catch(() => {});
}

function renderSkeleton() {
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card"></div>`).join("");
}

let allProducts = [];

async function loadCatalog() {
  renderSkeleton();
  try {
    const { results: collections = [] } = await FourthwallAPI.getCollections();
    // Fourthwall's own built-in "All Products" collection (slug "all") is
    // the exact same "show everything" list the hardcoded "Alle" pill
    // below already covers -- shown as its own pill too, it read as two
    // identical filters side by side. Computed once and reused both here
    // (excluded from the pill list) and below (still the real catch-all
    // data source for "Alle").
    const catchAll = collections.find((c) => /all/i.test(c.slug) || /all/i.test(c.name));

    if (filterBar) {
      filterBar.innerHTML =
        `<button class="filter-pill rip rip--accent is-active" data-slug="">Alle</button>` +
        collections
          .filter((c) => c !== catchAll)
          .map((c) => `<button class="filter-pill rip" data-slug="${c.slug}">${c.name}</button>`)
          .join("");
      filterBar.querySelectorAll(".filter-pill").forEach((pill) => {
        pill.addEventListener("click", () => selectFilter(pill, collections));
      });
    }

    if (catchAll) {
      const { results = [] } = await FourthwallAPI.getCollectionProducts(catchAll.slug);
      allProducts = results;
    } else {
      const lists = await Promise.all(collections.map((c) => FourthwallAPI.getCollectionProducts(c.slug).catch(() => ({ results: [] }))));
      const seen = new Map();
      lists.flatMap((l) => l.results || []).forEach((p) => seen.set(p.id, p));
      allProducts = [...seen.values()];
    }
    renderGrid(allProducts);
  } catch (err) {
    console.error("Catalog load failed:", err);
    if (grid) {
      grid.innerHTML = `<div class="error-state"><h2>Shop lädt gerade nicht</h2><p>Bitte versuch's gleich nochmal.</p></div>`;
    }
  }
}

async function selectFilter(pill, collections) {
  filterBar?.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
  pill.classList.add("is-active");
  const slug = pill.getAttribute("data-slug");
  if (!slug) {
    renderGrid(allProducts);
    return;
  }
  renderSkeleton();
  try {
    const { results = [] } = await FourthwallAPI.getCollectionProducts(slug);
    renderGrid(results);
  } catch (err) {
    console.error("Filter load failed:", err);
  }
}

loadCatalog();
