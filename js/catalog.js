import { FourthwallAPI } from "./fourthwall-api.js";
import { money } from "./currency.js";

const grid = document.getElementById("product-grid");
const filterBar = document.getElementById("filter-bar");

function cheapestVariant(product) {
  const variants = product.variants || [];
  return variants.reduce((min, v) => (!min || (v.unitPrice?.value ?? 0) < (min.unitPrice?.value ?? 0) ? v : min), null);
}

function isSoldOut(product) {
  const variants = product.variants || [];
  if (!variants.length) return false;
  return variants.every((v) => v.stock?.type === "LIMITED" && (v.stock?.quantity ?? 0) <= 0);
}

function productCardHTML(product) {
  const img = product.images?.[0]?.url || product.image?.url || "";
  const variant = cheapestVariant(product);
  const price = variant ? money(variant.unitPrice?.value ?? 0, variant.unitPrice?.currency) : "";
  const compareAt = variant?.compareAtPrice?.value;
  const soldOut = isSoldOut(product);

  return `
  <a href="#" class="product-card rip reveal" data-product-slug="${product.slug}">
    ${soldOut ? `<span class="badge-soldout">Ausverkauft</span>` : ""}
    <div class="product-photo-frame">
      ${img ? `<img src="${img}" alt="${product.name}" loading="lazy">` : ""}
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

    if (filterBar) {
      filterBar.innerHTML =
        `<button class="filter-pill rip rip--accent is-active" data-slug="">Alle</button>` +
        collections.map((c) => `<button class="filter-pill rip" data-slug="${c.slug}">${c.name}</button>`).join("");
      filterBar.querySelectorAll(".filter-pill").forEach((pill) => {
        pill.addEventListener("click", () => selectFilter(pill, collections));
      });
    }

    const catchAll = collections.find((c) => /all/i.test(c.slug) || /all/i.test(c.name));
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
