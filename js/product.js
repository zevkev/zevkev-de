// Product detail page — reads the product slug from either ?slug=... (the
// original URL form) or the URL path (the clean /shop/<slug> form served by
// the repo root's 404.html, see getSlugFromLocation() below) and renders
// one product full-page. This replaces js/catalog.js's old openQuickView()
// modal; the swatch/gallery/stock/qty/add-to-cart logic below is ported
// close to as-is from that modal, just targeting page elements (#pd-*)
// instead of a modal (#qv-*).
import { FourthwallAPI } from "./fourthwall-api.js";
import { Cart } from "./cart.js";
import { money } from "./currency.js";
import { track } from "./track.js";

const root = document.getElementById("product-root");

// GitHub Pages has no server-side rewrites/routing config, so clean product
// URLs (zevkev.de/shop/<slug>) are served via the repo root's 404.html,
// which GitHub Pages serves for ANY unmatched path site-wide. 404.html is
// structurally identical to this page (loads this same script) — it just
// has no ?slug= query string, since the slug there is the URL path itself.
// Prefer the query string when present so the original shop/product/?slug=
// links (already shared/bookmarked) keep working unchanged.
function getSlugFromLocation() {
  const qsSlug = new URLSearchParams(window.location.search).get("slug");
  if (qsSlug) return qsSlug;

  // A single path segment directly under /shop/ — e.g. /shop/zevkev-t-shirt
  // — but not /shop/product/ itself (this page's own path, with no query
  // string, means "no product selected", not "a product literally named
  // product"), and not /shop/ alone (a real file, index.html, which never
  // reaches 404.html in the first place).
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "shop" && parts[1] !== "product") {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

// Same fixed-ish attribute shape as catalog.js: a variant's attributes look
// like { description: "White, S", color: { name, swatch }, size: { name } }.
// "description" is just the human-readable summary of the others, so it's
// excluded from the option groups.
function attributeGroups(product) {
  const groups = new Map();
  (product.variants || []).forEach((v) => {
    Object.entries(v.attributes || {}).forEach(([key, val]) => {
      if (key === "description" || !val || typeof val !== "object" || val.name == null) return;
      if (!groups.has(key)) groups.set(key, new Map());
      groups.get(key).set(val.name, val.swatch || null);
    });
  });
  return groups;
}

function findVariant(product, selection) {
  return (product.variants || []).find((v) =>
    Object.entries(selection).every(([key, value]) => v.attributes?.[key]?.name === value)
  );
}

// Each variant carries its own images array; for apparel it's identical
// across sizes of one color but differs across colors, so the gallery
// should follow the selected color instead of showing every color's
// photos at once (a shirt with 6 colors x 7 angles is 42 thumbnails).
function imagesForSelection(product, selection) {
  if (selection.color) {
    const variant = (product.variants || []).find((v) => v.attributes?.color?.name === selection.color);
    if (variant?.images?.length) return variant.images;
  }
  return product.images?.length ? product.images : product.image ? [product.image] : [];
}

// Fourthwall's Storefront API returns two more per-product info fields
// besides `description` that this page never read before: `additionalInformation`
// (an array of { type, title, bodyHtml } -- observed types include
// MORE_DETAILS for material/fit, SIZE_AND_FIT, GUARANTEE_AND_RETURNS) and
// `sizeGuide` ({ url, content } -- confirmed shape via Fourthwall's own docs;
// null on most products today). Rendered as a details/summary accordion
// reusing the .info-accordion CSS in shop.css (already written, was unused
// until now). Returns "" when there's nothing to show, rather than an empty
// accordion shell.
function additionalInfoHTML(product) {
  const items = [...(product.additionalInformation || [])];
  const guide = product.sizeGuide;
  if (guide?.content || guide?.url) {
    const link = guide.url ? `<p><a href="${guide.url}" target="_blank" rel="noopener">Größentabelle ansehen</a></p>` : "";
    items.push({ title: "Größentabelle", bodyHtml: `${guide.content || ""}${link}` });
  }
  if (!items.length) return "";
  return `
    <div class="info-accordion">
      ${items
        .map(
          (entry, i) => `
      <details${i === 0 ? " open" : ""}>
        <summary>${entry.title || "Details"}</summary>
        <div class="body-html">${entry.bodyHtml || ""}</div>
      </details>`
        )
        .join("")}
    </div>`;
}

function renderSkeleton() {
  if (!root) return;
  root.innerHTML = `
    <div class="product-page">
      <div class="skeleton-card" style="height:420px;"></div>
      <div class="skeleton-card" style="height:420px;"></div>
    </div>`;
}

function renderMessage(title, text) {
  if (!root) return;
  root.innerHTML = `
    <div class="empty-state">
      <h2>${title}</h2>
      <p>${text}</p>
      <a href="/shop/" class="p-btn rip btn-accent">Zurück zum Shop</a>
    </div>`;
}

// getProduct() is the direct "one product by slug" endpoint Fourthwall
// exposes. If it ever fails (wrong slug shape, product unpublished from
// that endpoint, transient error) fall back to the same collection-walk
// loadCatalog() in catalog.js already does, and find the matching slug
// client-side.
async function fetchProduct(slug) {
  try {
    const data = await FourthwallAPI.getProduct(slug);
    const product = data?.results ?? data?.product ?? data;
    if (product && (product.variants || product.id)) return product;
  } catch (err) {
    console.warn("getProduct failed, falling back to catalog scan:", err);
  }

  const { results: collections = [] } = await FourthwallAPI.getCollections();
  const catchAll = collections.find((c) => /all/i.test(c.slug) || /all/i.test(c.name));
  if (catchAll) {
    const { results = [] } = await FourthwallAPI.getCollectionProducts(catchAll.slug);
    const found = results.find((p) => p.slug === slug);
    if (found) return found;
  }
  const lists = await Promise.all(
    collections.map((c) => FourthwallAPI.getCollectionProducts(c.slug).catch(() => ({ results: [] })))
  );
  for (const list of lists) {
    const found = (list.results || []).find((p) => p.slug === slug);
    if (found) return found;
  }
  return null;
}

function updateMeta(product, imageUrl) {
  document.title = `${product.name} | ZevKev Shop`;
  const desc = `${product.name} — im ZevKev Merch Shop. Sicher bestellen über Fourthwall.`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", `${product.name} | ZevKev Shop`);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", desc);
  // Point the share URL (and the SEO canonical tag) at the clean
  // /shop/<slug> form regardless of which URL form actually served this
  // page (?slug=, the 404.html path fallback, or the plain product-not-
  // found 404.html render) — that's the link this site now hands out from
  // the product grid (see catalog.js), so it's the one worth sharing/
  // indexing. 404.html has no canonical <link> in its static HTML at all
  // (it's a generic error-page shell reused for a real render), so create
  // one on demand rather than assuming it exists.
  const canonicalUrl = `https://zevkev.de/shop/${product.slug}`;
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
  if (imageUrl) {
    document.querySelector('meta[property="og:image"]')?.setAttribute("content", imageUrl);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute("content", imageUrl);
  }
}

function renderProduct(product) {
  if (!root) return;

  const groups = attributeGroups(product);
  const selection = {};
  groups.forEach((values, option) => {
    selection[option] = [...values.keys()][0];
  });
  let images = imagesForSelection(product, selection);

  updateMeta(product, images[0]?.url);
  track("product_view", product.slug);

  root.innerHTML = `
    <div class="product-page reveal">
      <div>
        <div class="product-gallery-main rip rip--photo" id="pd-main-frame">
          <img id="pd-main-image" src="${images[0]?.url || ""}" alt="${product.name}">
          <span class="qv-zoom-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg></span>
        </div>
      </div>
      <div class="product-info rip">
        <h1>${product.name}</h1>
        <div class="product-price-block">
          <span class="price-tag" id="pd-price"></span>
          <span class="price-compare" id="pd-compare"></span>
        </div>
        <div class="qv-divider"></div>
        ${product.description ? `<div class="product-description">${product.description}</div><div class="qv-divider"></div>` : ""}
        ${additionalInfoHTML(product)}
        <div id="pd-options"></div>
        <div class="qv-divider"></div>
        <div class="add-to-cart-row">
          <div class="qty-stepper">
            <button type="button" id="pd-qty-minus" aria-label="Weniger">&minus;</button>
            <input type="number" id="pd-qty" value="1" min="1">
            <button type="button" id="pd-qty-plus" aria-label="Mehr">+</button>
          </div>
          <button class="p-btn rip btn-accent" id="pd-add" data-track-click="shop-add-to-cart">In den Warenkorb</button>
        </div>
        <p class="stock-note" id="pd-stock"></p>
        <p class="stock-note">Preise inkl. MwSt., zzgl. Versandkosten.</p>
      </div>
    </div>
    <div class="qv-lightbox" id="pd-lightbox"><img id="pd-lightbox-img" src="" alt=""><button class="cart-close qv-close" id="pd-lightbox-close" aria-label="Schließen">&times;</button></div>`;

  root.querySelector("#pd-main-frame").addEventListener("click", () => {
    root.querySelector("#pd-lightbox-img").src = root.querySelector("#pd-main-image").src;
    root.querySelector("#pd-lightbox").classList.add("is-open");
  });
  const closeLightbox = () => root.querySelector("#pd-lightbox").classList.remove("is-open");
  root.querySelector("#pd-lightbox-close").addEventListener("click", closeLightbox);
  root.querySelector("#pd-lightbox").addEventListener("click", (ev) => {
    if (ev.target.id === "pd-lightbox") closeLightbox();
  });

  const optionsEl = root.querySelector("#pd-options");
  optionsEl.innerHTML = [...groups.entries()]
    .map(([option, values]) => {
      const swatches = [...values.entries()]
        .map(([name, swatch]) =>
          swatch
            ? `<button type="button" class="swatch-color" data-option="${option}" data-value="${name}" title="${name}"><span class="chip" style="background:${swatch};"></span><span class="label">${name}</span></button>`
            : `<button type="button" class="swatch-size" data-option="${option}" data-value="${name}">${name}</button>`
        )
        .join("");
      return `
      <div class="option-group">
        <label>${option}</label>
        <div class="option-swatches" data-option="${option}">${swatches}</div>
      </div>`;
    })
    .join("");

  function syncSelection() {
    const variant = findVariant(product, selection) || product.variants?.[0];
    root.querySelectorAll(".swatch-size, .swatch-color").forEach((btn) => {
      btn.classList.toggle("is-selected", selection[btn.dataset.option] === btn.dataset.value);
    });
    const priceEl = root.querySelector("#pd-price");
    const compareEl = root.querySelector("#pd-compare");
    if (variant) {
      priceEl.textContent = money(variant.unitPrice?.value ?? 0, variant.unitPrice?.currency);
      const compareAt = variant.compareAtPrice?.value;
      compareEl.textContent = compareAt ? money(compareAt, variant.unitPrice?.currency) : "";
    } else {
      priceEl.textContent = "";
      compareEl.textContent = "";
    }
    const outOfStock = variant?.stock?.type === "LIMITED" && (variant?.stock?.quantity ?? 0) <= 0;
    root.querySelector("#pd-stock").textContent = outOfStock ? "Gerade nicht auf Lager." : "";
    root.querySelector("#pd-add").disabled = !!outOfStock || !variant;
    root.querySelector("#pd-add").dataset.variantId = variant?.id || "";
  }

  optionsEl.querySelectorAll(".swatch-size, .swatch-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      selection[btn.dataset.option] = btn.dataset.value;
      if (btn.dataset.option === "color") {
        images = imagesForSelection(product, selection);
        renderGallery();
      }
      syncSelection();
    });
  });

  function renderGallery() {
    root.querySelector("#pd-main-image").src = images[0]?.url || "";
    root.querySelector(".product-thumbs")?.remove();
    if (images.length > 1) {
      const thumbsHTML = images
        .map((img, i) => `<button class="product-thumb${i === 0 ? " is-active" : ""}" data-src="${img.url}"><img src="${img.url}" alt=""></button>`)
        .join("");
      root.querySelector(".product-gallery-main").insertAdjacentHTML("afterend", `<div class="product-thumbs">${thumbsHTML}</div>`);
      root.querySelectorAll(".product-thumb").forEach((t) => {
        t.addEventListener("click", () => {
          root.querySelector("#pd-main-image").src = t.dataset.src;
          root.querySelectorAll(".product-thumb").forEach((x) => x.classList.remove("is-active"));
          t.classList.add("is-active");
        });
      });
    }
  }
  renderGallery();

  root.querySelector("#pd-qty-minus").addEventListener("click", () => {
    const input = root.querySelector("#pd-qty");
    input.value = Math.max(1, Number(input.value) - 1);
  });
  root.querySelector("#pd-qty-plus").addEventListener("click", () => {
    const input = root.querySelector("#pd-qty");
    input.value = Number(input.value) + 1;
  });

  root.querySelector("#pd-add").addEventListener("click", (ev) => {
    const variantId = ev.currentTarget.dataset.variantId;
    const qtyInput = root.querySelector("#pd-qty");
    const qty = Number(qtyInput.value) || 1;
    if (!variantId) return;
    // Cart.addItem() (js/cart.js) already shows a toast and opens the cart
    // drawer on success — that's the "what happens next" for a real page,
    // replacing the modal's old closeModal() call.
    Cart.addItem(variantId, qty);
    qtyInput.value = 1;
  });

  syncSelection();

  // Same generic .reveal fade-in / IntersectionObserver used site-wide
  // (and by catalog.js's product grid) — imported after the markup exists
  // since initReveal() reads the DOM once at import time.
  import("/js/home.js").catch(() => {});
}

async function init() {
  const slug = getSlugFromLocation();
  if (!slug) {
    renderMessage("Kein Produkt ausgewählt", "Für diesen Link fehlt die Produktangabe. Schau stattdessen im Shop vorbei.");
    return;
  }
  renderSkeleton();
  try {
    const product = await fetchProduct(slug);
    if (!product) {
      renderMessage("Produkt nicht gefunden", "Es gibt dieses Produkt nicht (mehr) — vielleicht wurde es entfernt oder der Link stimmt nicht mehr.");
      return;
    }
    renderProduct(product);
  } catch (err) {
    console.error("Product load failed:", err);
    renderMessage("Produkt lädt gerade nicht", "Bitte versuch's gleich nochmal.");
  }
}

init();
