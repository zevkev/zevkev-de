// Product page. Serves both /shop/product/?slug=<slug> (shop/product/
// index.html) and the clean /shop/<slug> URL, which GitHub Pages answers
// with the root 404.html (no server side rewrites there). Both pages only
// provide <div id="product-root"> and load this module.
//
// The gallery always shows the photos of the selected color: every variant
// carries its own images (identical across the sizes of one color), so a
// color switch swaps the whole gallery and starts at its first photo.
import { FourthwallAPI, variantInStock, variantOnSale, imagesForColor } from "/js/fourthwall-api.js";
import { Cart, escapeHTML, ICON } from "/js/cart.js";
import { money } from "/js/currency.js";
import { initReveal } from "/js/reveal.js";

const root = document.getElementById("product-root");

const OPTION_LABELS = { color: "Farbe", size: "Größe" };
const INFO_TITLES = {
  MORE_DETAILS: "Material und Details",
  SIZE_AND_FIT: "Größe und Passform",
  GUARANTEE_AND_RETURNS: "Qualitätsgarantie und Rückgabe",
};

const icon = (d, cls = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${d}</svg>`;
const ICONS = {
  back: icon('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  chevronRight: icon('<path d="m9 18 6-6-6-6"/>'),
  prev: icon('<path d="m15 18-6-6 6-6"/>'),
  next: icon('<path d="m9 18 6-6-6-6"/>'),
  zoom: icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>'),
  chevronDown: icon('<path d="m6 9 6 6 6-6"/>', "pd-acc-chevron"),
  truck: icon('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>'),
  spinner: icon('<path d="M21 12a9 9 0 1 1-6.2-8.56"/>', "animate-spin"),
};

// ---------- URL ----------
function getSlug() {
  const qs = new URLSearchParams(location.search).get("slug");
  if (qs) return qs.trim();
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "shop" && parts[1] !== "product") {
    try {
      return decodeURIComponent(parts[1]);
    } catch {
      return parts[1];
    }
  }
  return null;
}

// ---------- Data ----------
// Fourthwall's direct product endpoint first; if that fails for any reason
// other than "does not exist", look for the slug in the collections.
async function fetchProduct(slug) {
  try {
    return await FourthwallAPI.getProduct(slug);
  } catch (err) {
    if (err?.status === 404) return null;
    console.warn("getProduct failed, scanning collections:", err);
  }
  const collections = await FourthwallAPI.getCollections();
  for (const c of collections) {
    const products = await FourthwallAPI.getCollectionProducts(c.slug).catch(() => []);
    const found = products.find((p) => p.slug === slug);
    if (found) return found;
  }
  return null;
}

// Option groups from the variants' attributes, color first, then size, then
// anything else, each with its values in variant order.
function optionGroups(product) {
  const groups = new Map();
  for (const v of product.variants || []) {
    for (const [key, val] of Object.entries(v.attributes || {})) {
      if (key === "description" || !val || typeof val !== "object" || val.name == null) continue;
      if (!groups.has(key)) groups.set(key, new Map());
      const values = groups.get(key);
      if (!values.has(val.name)) values.set(val.name, { name: val.name, swatch: val.swatch || null });
    }
  }
  const order = (k) => (k === "color" ? 0 : k === "size" ? 1 : 2);
  return [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([key, values]) => ({ key, values: [...values.values()] }));
}

function matches(variant, selection) {
  return Object.entries(selection).every(([k, v]) => variant.attributes?.[k]?.name === v);
}

// Light cleanup for the shop's own rich text from Fourthwall: no scripts,
// no event handlers, and no inline styles (those carry fixed colors that
// would be unreadable in dark mode).
function cleanHTML(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta, form, input, button, textarea, select").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "class" || name === "id") el.removeAttribute(attr.name);
      else if ((name === "href" || name === "src") && /^\s*(javascript|data):/i.test(attr.value)) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      el.classList.add("link");
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    }
  });
  return doc.body.firstElementChild.innerHTML.trim();
}

function swatchColor(value) {
  return value && CSS.supports("color", value) ? value : "#bdbdbd";
}

// ---------- Meta ----------
function setMeta(selector, attr, value) {
  document.querySelector(selector)?.setAttribute(attr, value);
}

function updateMeta(product, imageUrl) {
  const title = `${product.name} | ZevKev Shop`;
  const desc = `${product.name} aus dem offiziellen ZevKev Merch Shop. Sicher bestellen über Fourthwall.`;
  const url = `https://zevkev.de/shop/${encodeURIComponent(product.slug)}`;
  document.title = title;
  setMeta('meta[name="description"]', "content", desc);
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", desc);
  setMeta('meta[property="og:url"]', "content", url);
  if (imageUrl) {
    setMeta('meta[property="og:image"]', "content", imageUrl);
    setMeta('meta[name="twitter:image"]', "content", imageUrl);
  }
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

// ---------- Simple states ----------
function renderSkeleton() {
  root.setAttribute("aria-busy", "true");
  root.innerHTML = `
    <div class="skeleton mb-6 h-5 w-48"></div>
    <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-10" aria-hidden="true">
      <div><div class="skeleton aspect-[3/4] w-full"></div><div class="mt-3 flex gap-2">${'<div class="skeleton size-16"></div>'.repeat(4)}</div></div>
      <div class="space-y-4 pt-2"><div class="skeleton h-14 w-4/5"></div><div class="skeleton h-9 w-32"></div><div class="skeleton h-28 w-full"></div><div class="skeleton h-12 w-full"></div></div>
    </div>`;
}

function renderMessage(title, text, { retry = false } = {}) {
  root.removeAttribute("aria-busy");
  root.innerHTML = `
    <div class="paper paper-c mx-auto max-w-lg px-6 py-10 text-center sm:px-10">
      <div class="tape left-1/2 -translate-x-1/2"></div>
      <h1 class="text-5xl">${title}</h1>
      <p class="mt-3 text-ink-muted">${text}</p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        ${retry ? `<button type="button" class="btn btn-accent" data-pd-retry>Nochmal versuchen</button>` : ""}
        <a href="/shop/" class="btn${retry ? "" : " btn-accent"}">${ICONS.back}Zum Shop</a>
      </div>
    </div>`;
  root.querySelector("[data-pd-retry]")?.addEventListener("click", init);
}

// ---------- Product ----------
function renderProduct(product) {
  const groups = optionGroups(product);
  const variants = product.variants || [];
  const hasColor = groups.some((g) => g.key === "color");

  // Start on the first variant that can be bought.
  const startVariant = variants.find(variantInStock) || variants[0];
  const selection = {};
  for (const g of groups) selection[g.key] = startVariant?.attributes?.[g.key]?.name ?? g.values[0]?.name;

  let images = imagesForColor(product, hasColor ? selection.color : null);
  let index = 0;

  updateMeta(product, images[0]?.url);

  const name = escapeHTML(product.name);
  const description = cleanHTML(product.description);
  const infoItems = (product.additionalInformation || [])
    .map((entry) => ({ title: INFO_TITLES[entry.type] || entry.title || "Details", body: cleanHTML(entry.bodyHtml) }))
    .filter((entry) => entry.body);
  const guide = product.sizeGuide;
  if (guide?.content || guide?.url) {
    const link = guide.url && /^https?:/i.test(guide.url)
      ? `<p><a href="${escapeHTML(guide.url)}" target="_blank" rel="noopener" class="link">Größentabelle öffnen</a></p>`
      : "";
    infoItems.push({ title: "Größentabelle", body: `${cleanHTML(guide.content)}${link}` });
  }
  const accordion = [
    description ? { title: "Beschreibung", body: description } : null,
    ...infoItems,
  ].filter(Boolean);

  root.removeAttribute("aria-busy");
  root.innerHTML = `
    <nav class="mb-6 flex min-w-0 items-center gap-2 text-sm font-semibold text-white/85" aria-label="Brotkrumen">
      <a href="/shop/" class="inline-flex shrink-0 items-center gap-1.5 rounded-md hover:text-white hover:underline [&>svg]:size-4">${ICONS.back}Shop</a>
      <span class="shrink-0 opacity-60 [&>svg]:size-4">${ICONS.chevronRight}</span>
      <span class="truncate text-white" aria-current="page">${name}</span>
    </nav>

    <div class="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
      <section class="paper paper-b reveal min-w-0 p-3 sm:p-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]" aria-label="Produktbilder">
        <div class="pd-stage cork" id="pd-stage">
          <button type="button" class="pd-zoom" id="pd-zoom" aria-label="Bild vergrößern">
            <img id="pd-main" alt="" decoding="async">
            <span class="pd-zoom-hint" aria-hidden="true">${ICONS.zoom}</span>
          </button>
          <button type="button" class="pd-nav pd-nav-prev" id="pd-prev" aria-label="Vorheriges Bild">${ICONS.prev}</button>
          <button type="button" class="pd-nav pd-nav-next" id="pd-next" aria-label="Nächstes Bild">${ICONS.next}</button>
          <span class="pd-count" id="pd-count" aria-hidden="true"></span>
        </div>
        <div class="pd-thumbs" id="pd-thumbs" aria-label="Weitere Bilder"></div>
      </section>

      <section class="paper reveal min-w-0 px-5 pb-7 pt-8 sm:px-8" aria-labelledby="pd-title">
        <div class="tape"></div>
        <h1 id="pd-title" class="text-5xl sm:text-6xl">${name}</h1>
        <div class="mt-4 flex flex-wrap items-center gap-3" id="pd-price"></div>
        <hr class="divider-dashed my-6">
        <div id="pd-options" class="space-y-6"></div>
        <div class="mt-7 flex flex-wrap items-stretch gap-3">
          <div class="qty-stepper" role="group" aria-label="Menge">
            <button type="button" id="pd-qty-dec" aria-label="Eins weniger">${ICON.minus}</button>
            <input id="pd-qty" type="number" inputmode="numeric" min="1" max="99" value="1" aria-label="Menge">
            <button type="button" id="pd-qty-inc" aria-label="Eins mehr">${ICON.plus}</button>
          </div>
          <button type="button" id="pd-add" class="btn btn-accent btn-lg min-w-[13rem] flex-1">${ICON.cart}<span>In den Warenkorb</span></button>
        </div>
        <p id="pd-stock" class="pd-stock mt-4" aria-live="polite"></p>
        <p class="mt-2 flex items-center gap-2 text-sm text-ink-muted [&>svg]:size-4 [&>svg]:shrink-0">${ICONS.truck}Preise inkl. MwSt., zzgl. Versandkosten.</p>
        ${accordion.length ? `
        <div class="pd-accordion mt-7">
          ${accordion
            .map(
              (item, i) => `
          <details${i === 0 ? " open" : ""}>
            <summary>${escapeHTML(item.title)}${ICONS.chevronDown}</summary>
            <div class="pd-rich">${item.body}</div>
          </details>`
            )
            .join("")}
        </div>` : ""}
      </section>
    </div>`;

  const el = {
    stage: root.querySelector("#pd-stage"),
    main: root.querySelector("#pd-main"),
    zoom: root.querySelector("#pd-zoom"),
    prev: root.querySelector("#pd-prev"),
    next: root.querySelector("#pd-next"),
    count: root.querySelector("#pd-count"),
    thumbs: root.querySelector("#pd-thumbs"),
    price: root.querySelector("#pd-price"),
    options: root.querySelector("#pd-options"),
    qty: root.querySelector("#pd-qty"),
    add: root.querySelector("#pd-add"),
    stock: root.querySelector("#pd-stock"),
  };

  // ----- Gallery -----
  function showImage(i) {
    if (!images.length) {
      el.main.removeAttribute("src");
      el.main.alt = "";
      el.zoom.disabled = true;
      el.prev.hidden = el.next.hidden = el.count.hidden = true;
      return;
    }
    index = (i + images.length) % images.length;
    el.main.src = images[index].url;
    el.main.alt = `${product.name}${selection.color && hasColor ? `, ${selection.color}` : ""}, Bild ${index + 1} von ${images.length}`;
    el.zoom.disabled = false;
    const multi = images.length > 1;
    el.prev.hidden = el.next.hidden = el.count.hidden = !multi;
    el.count.textContent = `${index + 1} / ${images.length}`;
    el.thumbs.querySelectorAll("button").forEach((b, n) => {
      const active = n === index;
      b.classList.toggle("is-active", active);
      if (active) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
    lightbox.sync();
  }

  function renderGallery() {
    el.thumbs.hidden = images.length < 2;
    el.thumbs.innerHTML = images.length < 2
      ? ""
      : images
          .map(
            (img, n) =>
              `<button type="button" class="pd-thumb cork" data-index="${n}" aria-label="Bild ${n + 1} von ${images.length} zeigen"><img src="${escapeHTML(img.url)}" alt="" loading="lazy" decoding="async"></button>`
          )
          .join("");
    showImage(0);
  }

  el.thumbs.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-index]");
    if (b) showImage(Number(b.dataset.index));
  });
  el.prev.addEventListener("click", () => showImage(index - 1));
  el.next.addEventListener("click", () => showImage(index + 1));

  const lightbox = createLightbox({
    getImages: () => images,
    getIndex: () => index,
    setIndex: (i) => showImage(i),
    title: product.name,
    returnFocusTo: el.zoom,
  });

  // A swipe must not also open the lightbox (some browsers still send a
  // click right after the touch ends).
  let lastSwipe = 0;
  addSwipe(el.stage, (dir) => {
    if (images.length < 2) return;
    lastSwipe = Date.now();
    showImage(index + dir);
  });
  el.zoom.addEventListener("click", () => {
    if (Date.now() - lastSwipe < 450) return;
    if (images.length) lightbox.open();
  });

  // ----- Options -----
  function isAvailable(key, value) {
    if (key === "color") return variants.some((v) => v.attributes?.color?.name === value && variantInStock(v));
    const v = variants.find((x) => matches(x, { ...selection, [key]: value }));
    return !!v && variantInStock(v);
  }

  function renderOptions() {
    el.options.innerHTML = groups
      .map((g) => {
        const label = OPTION_LABELS[g.key] || g.key.charAt(0).toUpperCase() + g.key.slice(1);
        const isColor = g.key === "color";
        const buttons = g.values
          .map((val) => {
            const selected = selection[g.key] === val.name;
            const available = isAvailable(g.key, val.name);
            const v = escapeHTML(val.name);
            if (isColor) {
              // Colors stay clickable when sold out, so their photos can
              // still be looked at; the add button then explains it.
              return `<button type="button" class="pd-swatch${available ? "" : " is-unavailable"}" data-key="color" data-value="${v}" aria-pressed="${selected}"${available ? "" : ` title="${v}, ausverkauft"`}>
                <span class="pd-swatch-dot" style="--swatch:${escapeHTML(swatchColor(val.swatch))}" aria-hidden="true"></span>
                <span>${v}</span>${available ? "" : '<span class="sr-only">, ausverkauft</span>'}
              </button>`;
            }
            return `<button type="button" class="pd-size${available ? "" : " is-unavailable"}" data-key="${escapeHTML(g.key)}" data-value="${v}" aria-pressed="${selected}"${available ? "" : ` disabled title="${v}, in dieser Farbe ausverkauft"`}>${v}${available ? "" : '<span class="sr-only">, ausverkauft</span>'}</button>`;
          })
          .join("");
        return `
          <fieldset>
            <legend class="pd-legend">${escapeHTML(label)}: <span class="pd-legend-value">${escapeHTML(selection[g.key] ?? "")}</span></legend>
            <div class="mt-2.5 flex flex-wrap gap-2">${buttons}</div>
          </fieldset>`;
      })
      .join("");
  }

  function currentVariant() {
    return variants.find((v) => matches(v, selection)) || null;
  }

  function syncPurchase() {
    const variant = currentVariant();
    const priceVariant = variant || variants.find((v) => v.attributes?.color?.name === selection.color) || variants[0];
    const currency = priceVariant?.unitPrice?.currency || "EUR";
    const sale = variantOnSale(priceVariant);
    el.price.innerHTML = priceVariant
      ? `<span class="price-tag price-tag-lg">${money(priceVariant.unitPrice?.value, currency)}</span>
         ${sale ? `<s class="price-compare text-lg">${money(priceVariant.compareAtPrice.value, currency)}</s><span class="shop-badge shop-badge-sale">Sale</span>` : ""}`
      : "";

    const inStock = variantInStock(variant);
    el.add.disabled = !inStock;
    el.add.dataset.variantId = inStock ? variant.id : "";
    el.add.querySelector("span").textContent = inStock ? "In den Warenkorb" : variant ? "Ausverkauft" : "Nicht verfügbar";

    let note;
    let tone = "ok";
    if (!variants.length) {
      note = "Dieses Produkt ist gerade nicht verfügbar.";
      tone = "bad";
    } else if (!variant) {
      note = "Diese Kombination gibt es leider nicht. Wähl bitte eine andere.";
      tone = "bad";
    } else if (!inStock) {
      note = hasColor && !isAvailable("color", selection.color)
        ? `${selection.color} ist gerade komplett ausverkauft.`
        : "Gerade ausverkauft.";
      tone = "bad";
    } else if (variant.stock?.type === "LIMITED") {
      const left = variant.stock.quantity ?? 0;
      note = left <= 5 ? `Nur noch ${left} Stück da.` : "Auf Lager.";
      tone = left <= 5 ? "low" : "ok";
    } else {
      note = "Verfügbar. Wird nach deiner Bestellung extra für dich gefertigt.";
    }
    el.stock.dataset.tone = tone;
    el.stock.innerHTML = `${tone === "ok" ? ICON.check : ICON.alert}<span></span>`;
    el.stock.querySelector("span").textContent = note;
  }

  el.options.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-key]");
    if (!b || b.disabled) return;
    const { key, value } = b.dataset;
    if (selection[key] === value) return;
    selection[key] = value;

    if (key === "color") {
      // Keep the chosen size if it exists in the new color, otherwise move
      // to the first size that can be bought in it.
      for (const g of groups) {
        if (g.key === "color" || isAvailable(g.key, selection[g.key])) continue;
        const firstOk = g.values.find((val) => isAvailable(g.key, val.name));
        if (firstOk) selection[g.key] = firstOk.name;
      }
      images = imagesForColor(product, value);
      renderGallery();
    }
    renderOptions();
    syncPurchase();
    // Re-rendering replaced the button, keep keyboard focus on it.
    el.options.querySelector(`button[data-key="${CSS.escape(key)}"][data-value="${CSS.escape(value)}"]`)?.focus({ preventScroll: true });
  });

  // ----- Quantity -----
  const clampQty = (n) => Math.max(1, Math.min(99, Math.floor(Number(n)) || 1));
  const setQty = (n) => {
    el.qty.value = String(clampQty(n));
  };
  root.querySelector("#pd-qty-dec").addEventListener("click", () => setQty(Number(el.qty.value) - 1));
  root.querySelector("#pd-qty-inc").addEventListener("click", () => setQty(Number(el.qty.value) + 1));
  el.qty.addEventListener("change", () => setQty(el.qty.value));

  // ----- Add to cart -----
  el.add.addEventListener("click", async () => {
    const variantId = el.add.dataset.variantId;
    if (!variantId || el.add.getAttribute("aria-busy") === "true") return;
    const label = el.add.querySelector("span");
    el.add.setAttribute("aria-busy", "true");
    el.add.disabled = true;
    el.add.querySelector("svg").outerHTML = ICONS.spinner;
    label.textContent = "Kommt in den Warenkorb";
    const ok = await Cart.addItem(variantId, clampQty(el.qty.value));
    el.add.removeAttribute("aria-busy");
    el.add.querySelector("svg").outerHTML = ICON.cart;
    if (ok) setQty(1);
    syncPurchase();
  });

  renderOptions();
  renderGallery();
  syncPurchase();
  initReveal(root);
}

// ---------- Lightbox ----------
// Fullscreen view of the current color's photos. Lives on <body> (a fixed
// element inside .paper or .reveal would be positioned against them). The
// photo sits on cork so white and black products both stay visible; the
// buttons are solid dark circles with a light ring, visible on any photo.
function createLightbox({ getImages, getIndex, setIndex, title, returnFocusTo }) {
  document.getElementById("pd-lightbox")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `
  <div id="pd-lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}, Bildansicht" hidden>
    <figure class="lightbox-stage cork"><img id="lb-img" alt=""></figure>
    <button type="button" class="lightbox-btn lightbox-close" aria-label="Bildansicht schließen">${ICON.close}</button>
    <button type="button" class="lightbox-btn lightbox-prev" aria-label="Vorheriges Bild">${ICONS.prev}</button>
    <button type="button" class="lightbox-btn lightbox-next" aria-label="Nächstes Bild">${ICONS.next}</button>
    <p class="lightbox-count" aria-live="polite"></p>
  </div>`
  );
  const box = document.getElementById("pd-lightbox");
  const img = box.querySelector("#lb-img");
  const stage = box.querySelector(".lightbox-stage");
  const count = box.querySelector(".lightbox-count");
  const prev = box.querySelector(".lightbox-prev");
  const next = box.querySelector(".lightbox-next");
  const close = box.querySelector(".lightbox-close");

  const isOpen = () => !box.hidden;

  function sync() {
    const images = getImages();
    const i = getIndex();
    if (!images.length) return;
    if (img.getAttribute("src") !== images[i].url) {
      img.src = images[i].url;
    }
    img.alt = `${title}, Bild ${i + 1} von ${images.length}`;
    const multi = images.length > 1;
    prev.hidden = next.hidden = count.hidden = !multi;
    count.textContent = `${i + 1} / ${images.length}`;
  }

  img.addEventListener("load", () => {
    if (img.naturalWidth && img.naturalHeight) stage.style.setProperty("--ar", String(img.naturalWidth / img.naturalHeight));
  });

  function open() {
    sync();
    box.hidden = false;
    document.documentElement.classList.add("lightbox-is-open");
    requestAnimationFrame(() => box.classList.add("is-open"));
    close.focus({ preventScroll: true });
  }

  function hide() {
    if (!isOpen()) return;
    box.classList.remove("is-open");
    box.hidden = true;
    document.documentElement.classList.remove("lightbox-is-open");
    returnFocusTo?.focus({ preventScroll: true });
  }

  close.addEventListener("click", hide);
  prev.addEventListener("click", () => setIndex(getIndex() - 1));
  next.addEventListener("click", () => setIndex(getIndex() + 1));
  // Clicks on the dark backdrop close it, clicks on the photo itself don't.
  box.addEventListener("click", (ev) => {
    if (ev.target === box || ev.target === count) hide();
  });
  document.addEventListener("keydown", (ev) => {
    if (!isOpen()) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      hide();
    } else if (ev.key === "ArrowLeft" && getImages().length > 1) {
      ev.preventDefault();
      setIndex(getIndex() - 1);
    } else if (ev.key === "ArrowRight" && getImages().length > 1) {
      ev.preventDefault();
      setIndex(getIndex() + 1);
    } else if (ev.key === "Tab") {
      const focusables = [...box.querySelectorAll("button")].filter((b) => !b.hidden);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      } else if (!box.contains(document.activeElement)) {
        ev.preventDefault();
        first.focus();
      }
    }
  });
  addSwipe(stage, (dir) => {
    if (getImages().length > 1) setIndex(getIndex() + dir);
  });

  return { open, close: hide, sync };
}

// Horizontal swipe on touch screens: dir +1 = next photo, -1 = previous.
function addSwipe(target, onSwipe) {
  let x0 = null;
  let y0 = null;
  target.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length !== 1) return;
      x0 = ev.touches[0].clientX;
      y0 = ev.touches[0].clientY;
    },
    { passive: true }
  );
  target.addEventListener(
    "touchend",
    (ev) => {
      if (x0 == null) return;
      const dx = ev.changedTouches[0].clientX - x0;
      const dy = ev.changedTouches[0].clientY - y0;
      x0 = y0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) onSwipe(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );
}

// ---------- Start ----------
async function init() {
  if (!root) return;
  const slug = getSlug();
  if (!slug) {
    renderMessage("Kein Produkt ausgewählt", "Bei diesem Link fehlt die Produktangabe. Schau dich einfach im Shop um.");
    return;
  }
  renderSkeleton();
  try {
    const product = await fetchProduct(slug);
    if (!product) {
      document.title = "Produkt nicht gefunden | ZevKev Shop";
      renderMessage("Produkt nicht gefunden", "Dieses Produkt gibt es nicht mehr, oder der Link ist nicht ganz richtig. Im Shop findest du alles, was es gerade gibt.");
      return;
    }
    renderProduct(product);
  } catch (err) {
    console.error("Product load failed:", err);
    renderMessage("Das Produkt lädt gerade nicht", "Da hakt gerade was bei der Verbindung. Bitte versuch es gleich nochmal.", { retry: true });
  }
}

init();
