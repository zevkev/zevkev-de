import { FourthwallAPI } from "./fourthwall-api.js";
import { Cart } from "./cart.js";

const grid = document.getElementById("product-grid");
const filterBar = document.getElementById("filter-bar");

function money(amount, currency) {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`;
  }
}

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
      const product = products.find((p) => p.slug === card.getAttribute("data-product-slug"));
      if (product) openQuickView(product);
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

// A variant's attributes look like { description: "White, S", color: { name,
// swatch }, size: { name } } — a fixed-ish object keyed by attribute type,
// not a generic list. "description" is just the human-readable summary of
// the others, so it's excluded from the option groups.
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

function openQuickView(product) {
  const existing = document.getElementById("quick-view");
  existing?.remove();

  const groups = attributeGroups(product);
  const selection = {};
  groups.forEach((values, option) => {
    selection[option] = [...values.keys()][0];
  });
  let images = imagesForSelection(product, selection);

  const modal = document.createElement("div");
  modal.id = "quick-view";
  modal.className = "cart-backdrop is-open";
  modal.innerHTML = `
    <div class="qv-panel rip">
      <button class="cart-close qv-close" id="qv-close" aria-label="Schließen">&times;</button>
      <div class="product-page">
        <div>
          <div class="product-gallery-main rip rip--photo" id="qv-main-frame">
            <img id="qv-main-image" src="${images[0]?.url || ""}" alt="${product.name}">
            <span class="qv-zoom-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg></span>
          </div>
        </div>
        <div class="product-info">
          <h1>${product.name}</h1>
          <div class="product-price-block"><span class="price-tag" id="qv-price"></span></div>
          <div class="qv-divider"></div>
          <div class="product-description">${product.description || ""}</div>
          <div class="qv-divider"></div>
          <div id="qv-options"></div>
          <div class="qv-divider"></div>
          <div class="add-to-cart-row">
            <div class="qty-stepper">
              <button type="button" id="qv-qty-minus">&minus;</button>
              <input type="number" id="qv-qty" value="1" min="1">
              <button type="button" id="qv-qty-plus">+</button>
            </div>
            <button class="p-btn rip btn-accent" id="qv-add">In den Warenkorb</button>
          </div>
          <p class="stock-note" id="qv-stock"></p>
        </div>
      </div>
    </div>
    <div class="qv-lightbox" id="qv-lightbox"><img id="qv-lightbox-img" src="" alt=""><button class="cart-close qv-close" id="qv-lightbox-close" aria-label="Schließen">&times;</button></div>`;
  document.body.appendChild(modal);

  modal.querySelector("#qv-main-frame").addEventListener("click", () => {
    modal.querySelector("#qv-lightbox-img").src = modal.querySelector("#qv-main-image").src;
    modal.querySelector("#qv-lightbox").classList.add("is-open");
  });
  const closeLightbox = () => modal.querySelector("#qv-lightbox").classList.remove("is-open");
  modal.querySelector("#qv-lightbox-close").addEventListener("click", closeLightbox);
  modal.querySelector("#qv-lightbox").addEventListener("click", (ev) => {
    if (ev.target.id === "qv-lightbox") closeLightbox();
  });

  const optionsEl = modal.querySelector("#qv-options");
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
    modal.querySelectorAll(".swatch-size, .swatch-color").forEach((btn) => {
      btn.classList.toggle("is-selected", selection[btn.dataset.option] === btn.dataset.value);
    });
    modal.querySelector("#qv-price").textContent = variant ? money(variant.unitPrice?.value ?? 0, variant.unitPrice?.currency) : "";
    const outOfStock = variant?.stock?.type === "LIMITED" && (variant?.stock?.quantity ?? 0) <= 0;
    modal.querySelector("#qv-stock").textContent = outOfStock ? "Gerade nicht auf Lager." : "";
    modal.querySelector("#qv-add").disabled = !!outOfStock || !variant;
    modal.querySelector("#qv-add").dataset.variantId = variant?.id || "";
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
    modal.querySelector("#qv-main-image").src = images[0]?.url || "";
    modal.querySelector(".product-thumbs")?.remove();
    if (images.length > 1) {
      const thumbsHTML = images
        .map((img, i) => `<button class="product-thumb${i === 0 ? " is-active" : ""}" data-src="${img.url}"><img src="${img.url}" alt=""></button>`)
        .join("");
      modal.querySelector(".product-gallery-main").insertAdjacentHTML("afterend", `<div class="product-thumbs">${thumbsHTML}</div>`);
      modal.querySelectorAll(".product-thumb").forEach((t) => {
        t.addEventListener("click", () => {
          modal.querySelector("#qv-main-image").src = t.dataset.src;
          modal.querySelectorAll(".product-thumb").forEach((x) => x.classList.remove("is-active"));
          t.classList.add("is-active");
        });
      });
    }
  }
  renderGallery();

  modal.querySelector("#qv-qty-minus").addEventListener("click", () => {
    const input = modal.querySelector("#qv-qty");
    input.value = Math.max(1, Number(input.value) - 1);
  });
  modal.querySelector("#qv-qty-plus").addEventListener("click", () => {
    const input = modal.querySelector("#qv-qty");
    input.value = Number(input.value) + 1;
  });

  modal.querySelector("#qv-add").addEventListener("click", (ev) => {
    const variantId = ev.currentTarget.dataset.variantId;
    const qty = Number(modal.querySelector("#qv-qty").value) || 1;
    if (!variantId) return;
    Cart.addItem(variantId, qty);
    closeModal();
  });

  function closeModal() {
    modal.remove();
  }
  modal.querySelector("#qv-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeModal();
  });

  syncSelection();
}

loadCatalog();
