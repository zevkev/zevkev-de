// Cart drawer and cart state, backed by a Fourthwall Storefront cart.
// js/layout.js calls Cart.init() on every /shop page (it also renders the
// header button #cart-open with the badge #cart-badge). init() mounts the
// drawer itself, loads the cart whose id is kept in localStorage and keeps
// the badge in sync. js/product.js calls Cart.addItem(variantId, quantity).
//
// All cart changes go through Fourthwall's POST endpoints (see
// js/fourthwall-api.js) and run one after another through a small queue, so
// fast clicks can never race each other or apply an older response last.
import { FourthwallAPI } from "/js/fourthwall-api.js";
import { money, toCents } from "/js/currency.js";

const STORAGE_KEY = "zevkev-cart-id";
const MAX_QTY = 99;

// Fourthwall's hosted checkout. It identifies the shop by the domain it runs
// on, so this must be a domain connected to the shop in Fourthwall. Checked
// on 2026-10-30: shop.zevkev.me (Fourthwall's servers) and the shop's own
// zevkev-shop.fourthwall.com both resolve to this shop and serve the
// checkout. The zevkev.me apex is GitHub Pages now and answers /checkout/
// with a 404, so never point this at the apex or at zevkev.de.
const CHECKOUT_ORIGIN = "https://shop.zevkev.me";

export function checkoutUrl(cartId) {
  // cartCurrency=EUR makes the checkout show and charge EUR (Fourthwall's
  // local currency feature), matching the EUR prices shown on this site.
  return `${CHECKOUT_ORIGIN}/checkout/?cartCurrency=EUR&cartId=${encodeURIComponent(cartId)}`;
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const svg = (d, cls = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${d}</svg>`;

export const ICON = {
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>'),
  cart: svg('<path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
};

// ---------- Toast (shared with the product page) ----------
export function showToast(text, tone = "info") {
  let toast = document.getElementById("shop-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "shop-toast";
    toast.className = "toast shop-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.classList.toggle("toast-error", tone === "error");
  // With the drawer open, show the toast inside it just above the footer,
  // so it never covers the checkout button. offsetWidth/offsetHeight ignore
  // the slide-in transform, so this is right even mid animation.
  const drawer = document.getElementById("cart-drawer");
  if (drawer?.classList.contains("is-open")) {
    const foot = document.getElementById("cart-foot");
    const footHeight = foot && !foot.hidden ? foot.offsetHeight : 0;
    toast.style.left = `${window.innerWidth - drawer.offsetWidth / 2}px`;
    toast.style.bottom = `${footHeight + 16}px`;
    toast.style.maxWidth = `${Math.max(200, drawer.offsetWidth - 40)}px`;
  } else {
    toast.style.left = toast.style.bottom = toast.style.maxWidth = "";
  }
  toast.innerHTML = `<span class="inline-flex items-center gap-2">${tone === "error" ? ICON.alert : ICON.check}<span></span></span>`;
  toast.querySelector("span span").textContent = text;
  // Restart the slide-in even when a toast is already showing.
  toast.classList.remove("is-visible");
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

// ---------- State ----------
const state = {
  cart: null,
  status: "idle", // idle | loading | error
  busyId: null, // variant id of the line currently being changed
};

function readId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

const lines = () => state.cart?.items || [];
const itemCount = () => lines().reduce((sum, it) => sum + (it.quantity || 0), 0);

// ---------- Markup ----------
let mounted = false;
let returnFocus = null;
const $ = (id) => document.getElementById(id);

function mount() {
  if (mounted) return;
  mounted = true;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
  <div id="cart-backdrop" class="cart-backdrop"></div>
  <aside id="cart-drawer" class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" aria-hidden="true" inert>
    <div class="flex items-center justify-between gap-4 px-5 pb-4 pt-6 sm:px-7">
      <h2 id="cart-title" class="flex items-baseline gap-3 text-4xl">Warenkorb <span id="cart-count" class="badge font-sans text-xs tracking-normal" hidden></span></h2>
      <button id="cart-close" type="button" class="cart-close" aria-label="Warenkorb schließen">${ICON.close}</button>
    </div>
    <hr class="divider-dashed mx-5 sm:mx-7">
    <div id="cart-body" class="cart-body"></div>
    <div id="cart-foot" class="cart-foot" hidden>
      <div class="flex items-baseline justify-between gap-4">
        <span class="font-semibold">Zwischensumme</span>
        <span id="cart-subtotal" class="font-display text-3xl tracking-wide"></span>
      </div>
      <p class="mt-1 text-sm text-ink-muted">Inkl. MwSt., zzgl. Versandkosten. Versand und Rabattcodes siehst du an der Kasse.</p>
      <a id="cart-checkout" href="/shop/" class="btn btn-accent btn-lg btn-block mt-4">${ICON.lock}Zur Kasse</a>
      <button type="button" class="cart-continue mt-2" data-cart-close>Weiter einkaufen</button>
    </div>
  </aside>`
  );

  $("cart-close").addEventListener("click", closeDrawer);
  $("cart-backdrop").addEventListener("click", closeDrawer);
  $("cart-drawer").addEventListener("click", onDrawerClick);
  $("cart-drawer").addEventListener("keydown", trapFocus);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && isOpen()) {
      ev.preventDefault();
      closeDrawer();
    }
  });
  render();
}

function lineHTML(it) {
  const v = it.variant || {};
  const id = escapeHTML(v.id);
  const name = v.product?.name || v.name || "Artikel";
  const slug = v.product?.slug;
  const href = slug ? `/shop/${encodeURIComponent(slug)}` : "/shop/";
  const img = v.images?.[0]?.url || "";
  const desc = v.attributes?.description || "";
  const qty = it.quantity || 0;
  const unit = v.unitPrice?.value ?? 0;
  const currency = v.unitPrice?.currency || "EUR";
  const pending = state.busyId === v.id;
  return `
    <li class="cart-line${pending ? " is-pending" : ""}" data-variant-id="${id}"${pending ? ' aria-busy="true"' : ""}>
      <a href="${href}" class="cart-thumb cork" tabindex="-1" aria-hidden="true">${img ? `<img src="${escapeHTML(img)}" alt="" loading="lazy" decoding="async">` : ""}</a>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <a href="${href}" class="block font-semibold leading-snug hover:underline">${escapeHTML(name)}</a>
            ${desc ? `<p class="mt-0.5 text-sm text-ink-muted">${escapeHTML(desc)}</p>` : ""}
          </div>
          <button type="button" class="cart-remove" data-cart-remove="${id}" aria-label="${escapeHTML(name)} entfernen" title="Entfernen">${ICON.trash}</button>
        </div>
        <div class="mt-2.5 flex items-center justify-between gap-3">
          <div class="qty-stepper qty-stepper-sm" role="group" aria-label="Menge für ${escapeHTML(name)}">
            <button type="button" data-cart-dec="${id}" aria-label="Eins weniger"${qty <= 1 ? " disabled" : ""}>${ICON.minus}</button>
            <span class="qty-value" aria-live="polite">${qty}</span>
            <button type="button" data-cart-inc="${id}" aria-label="Eins mehr"${qty >= MAX_QTY ? " disabled" : ""}>${ICON.plus}</button>
          </div>
          <div class="text-right leading-tight">
            <div class="font-semibold">${money((toCents(unit) * qty) / 100, currency)}</div>
            ${qty > 1 ? `<div class="text-xs text-ink-muted">${money(unit, currency)} pro Stück</div>` : ""}
          </div>
        </div>
      </div>
    </li>`;
}

function onShopIndex() {
  return /^\/shop\/?(index\.html)?$/.test(location.pathname);
}

function render() {
  const count = itemCount();

  const badge = $("cart-badge");
  if (badge) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
  }
  $("cart-open")?.setAttribute("aria-label", count ? `Warenkorb öffnen, ${count} Artikel` : "Warenkorb öffnen");

  if (!mounted) return;
  const body = $("cart-body");
  const foot = $("cart-foot");
  const countEl = $("cart-count");
  countEl.hidden = count === 0;
  countEl.textContent = `${count} Artikel`;

  if (state.status === "loading" && !state.cart) {
    body.innerHTML = `
      <div class="space-y-4 px-5 py-5 sm:px-7" aria-label="Warenkorb lädt">
        ${[0, 1].map(() => `<div class="flex gap-4"><div class="cart-skel size-20 shrink-0"></div><div class="flex-1 space-y-2 pt-1"><div class="cart-skel h-4 w-3/4"></div><div class="cart-skel h-3 w-1/3"></div><div class="cart-skel h-8 w-28"></div></div></div>`).join("")}
      </div>`;
    foot.hidden = true;
    return;
  }

  if (state.status === "error" && !state.cart) {
    body.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-icon text-danger">${ICON.alert}</span>
        <p class="font-display text-3xl">Das hat nicht geklappt</p>
        <p class="text-ink-muted">Dein Warenkorb konnte gerade nicht geladen werden.</p>
        <button type="button" class="btn btn-accent mt-2" data-cart-retry>Nochmal versuchen</button>
      </div>`;
    foot.hidden = true;
    return;
  }

  if (!lines().length) {
    body.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-icon">${ICON.cart}</span>
        <p class="font-display text-3xl">Dein Warenkorb ist leer</p>
        <p class="text-ink-muted">Schau dich im Shop um, da findest du bestimmt was.</p>
        <a href="/shop/" class="btn btn-accent mt-2"${onShopIndex() ? " data-cart-close" : ""}>Zum Shop</a>
      </div>`;
    foot.hidden = true;
    return;
  }

  body.innerHTML = `<ul class="cart-lines">${lines().map(lineHTML).join("")}</ul>`;
  const currency = lines()[0]?.variant?.unitPrice?.currency || "EUR";
  const subtotalCents = lines().reduce((sum, it) => sum + toCents(it.variant?.unitPrice?.value) * (it.quantity || 0), 0);
  $("cart-subtotal").textContent = money(subtotalCents / 100, currency);
  $("cart-checkout").href = checkoutUrl(state.cart.id);
  foot.hidden = false;
}

// Keeps keyboard focus in place across a re-render (the line controls are
// rebuilt on every change): same button if it is still usable, otherwise
// another control of the same line, otherwise the close button.
function renderKeepingFocus() {
  const active = document.activeElement;
  const attr = active && ["data-cart-inc", "data-cart-dec", "data-cart-remove"].find((a) => active.hasAttribute?.(a));
  const value = attr ? active.getAttribute(attr) : null;
  render();
  if (!attr || value == null) return;
  const body = $("cart-body");
  const v = CSS.escape(value);
  const target =
    body?.querySelector(`[${attr}="${v}"]:not([disabled])`) ||
    body?.querySelector(`[data-variant-id="${v}"] button:not([disabled])`) ||
    body?.querySelector("button:not([disabled])") ||
    $("cart-close");
  target?.focus({ preventScroll: true });
}

function onDrawerClick(ev) {
  const t = ev.target.closest("button, a");
  if (!t) return;
  if (t.hasAttribute("data-cart-close")) {
    ev.preventDefault();
    closeDrawer();
  } else if (t.hasAttribute("data-cart-retry")) {
    refresh();
  } else if (t.hasAttribute("data-cart-inc")) {
    stepQuantity(t.getAttribute("data-cart-inc"), 1);
  } else if (t.hasAttribute("data-cart-dec")) {
    stepQuantity(t.getAttribute("data-cart-dec"), -1);
  } else if (t.hasAttribute("data-cart-remove")) {
    removeItem(t.getAttribute("data-cart-remove"));
  }
}

// ---------- API actions ----------
function refresh() {
  return enqueue(async () => {
    const id = readId();
    if (!id) {
      state.cart = null;
      state.status = "idle";
      render();
      return;
    }
    state.status = "loading";
    render();
    try {
      state.cart = await FourthwallAPI.getCart(id);
      state.status = "idle";
    } catch (err) {
      if (err?.status === 404) {
        // Expired or already checked out: start fresh.
        writeId(null);
        state.cart = null;
        state.status = "idle";
      } else {
        console.error("Cart load failed:", err);
        state.status = "error";
      }
    }
    render();
  });
}

// apiCall runs inside the queue, so it sees the cart as left by every earlier
// click (three fast "+" clicks really add three). It may return null when
// there is nothing to do.
async function mutate(variantId, apiCall, failText) {
  return enqueue(async () => {
    const id = readId();
    if (!id || !state.cart) return false;
    const pending = apiCall(id);
    if (!pending) return false;
    state.busyId = variantId;
    renderKeepingFocus();
    try {
      state.cart = await pending;
      return true;
    } catch (err) {
      if (err?.status === 404) {
        writeId(null);
        state.cart = null;
        showToast("Dein Warenkorb war abgelaufen und wurde geleert.", "error");
      } else {
        console.error("Cart update failed:", err);
        showToast(failText, "error");
      }
      return false;
    } finally {
      state.busyId = null;
      renderKeepingFocus();
    }
  });
}

// Minus stops at 1. Removing a line is only ever the trash button, so a
// queued double click on minus can never delete something by accident.
function stepQuantity(variantId, delta) {
  return mutate(
    variantId,
    (id) => {
      const line = lines().find((it) => it.variant?.id === variantId);
      if (!line) return null;
      const next = Math.max(1, Math.min(MAX_QTY, (line.quantity || 0) + delta));
      if (next === line.quantity) return null;
      return FourthwallAPI.changeCart(id, [{ variantId, quantity: next }]);
    },
    "Die Menge konnte nicht geändert werden."
  );
}

function removeItem(variantId) {
  return mutate(
    variantId,
    (id) => (lines().some((it) => it.variant?.id === variantId) ? FourthwallAPI.removeFromCart(id, [variantId]) : null),
    "Der Artikel konnte nicht entfernt werden."
  );
}

function addItem(variantId, quantity = 1) {
  mount();
  const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(quantity)) || 1));
  if (!variantId) return Promise.resolve(false);
  return enqueue(async () => {
    try {
      let cart = null;
      const id = readId();
      if (id) {
        try {
          cart = await FourthwallAPI.addToCart(id, [{ variantId, quantity: qty }]);
        } catch (err) {
          if (err?.status !== 404) throw err;
          writeId(null); // stale cart id, fall through to a new cart
        }
      }
      if (!cart) {
        cart = await FourthwallAPI.createCart([{ variantId, quantity: qty }]);
        writeId(cart.id);
      }
      state.cart = cart;
      state.status = "idle";
      render();
      openDrawer();
      showToast(qty > 1 ? `${qty} Stück liegen jetzt im Warenkorb.` : "Liegt jetzt im Warenkorb.");
      return true;
    } catch (err) {
      console.error("Add to cart failed:", err);
      showToast("Das hat leider nicht geklappt. Bitte versuch es gleich nochmal.", "error");
      return false;
    }
  });
}

// ---------- Drawer ----------
function isOpen() {
  return $("cart-drawer")?.classList.contains("is-open") ?? false;
}

function openDrawer() {
  mount();
  const drawer = $("cart-drawer");
  if (isOpen()) return;
  const active = document.activeElement;
  returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
  drawer.removeAttribute("inert");
  drawer.setAttribute("aria-hidden", "false");
  drawer.classList.add("is-open");
  $("cart-backdrop").classList.add("is-open");
  document.documentElement.classList.add("cart-is-open");
  $("cart-open")?.setAttribute("aria-expanded", "true");
  // Wait a frame so the panel is visible (focus on a hidden element fails).
  requestAnimationFrame(() => $("cart-close")?.focus({ preventScroll: true }));
}

function closeDrawer() {
  const drawer = $("cart-drawer");
  if (!drawer || !isOpen()) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("inert", "");
  $("cart-backdrop").classList.remove("is-open");
  document.documentElement.classList.remove("cart-is-open");
  $("cart-open")?.setAttribute("aria-expanded", "false");
  const target = returnFocus && document.contains(returnFocus) ? returnFocus : $("cart-open");
  target?.focus({ preventScroll: true });
  returnFocus = null;
}

function trapFocus(ev) {
  if (ev.key !== "Tab" || !isOpen()) return;
  const focusables = [...$("cart-drawer").querySelectorAll('a[href]:not([tabindex="-1"]), button:not([disabled])')].filter(
    (el) => el.offsetParent !== null
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (ev.shiftKey && document.activeElement === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && document.activeElement === last) {
    ev.preventDefault();
    first.focus();
  }
}

// ---------- Init ----------
let initPromise = null;

function init() {
  initPromise ??= (async () => {
    mount();
    const opener = $("cart-open");
    if (opener) {
      opener.setAttribute("aria-haspopup", "dialog");
      opener.setAttribute("aria-controls", "cart-drawer");
      opener.setAttribute("aria-expanded", "false");
      opener.addEventListener("click", openDrawer);
    }
    // Another tab changed the cart, or the visitor came back from the
    // checkout with the back button (page restored from the bfcache).
    window.addEventListener("storage", (ev) => {
      if (ev.key === STORAGE_KEY) refresh();
    });
    window.addEventListener("pageshow", (ev) => {
      if (ev.persisted) refresh();
    });
    await refresh();
  })();
  return initPromise;
}

export const Cart = {
  init,
  addItem,
  openDrawer,
  closeDrawer,
  refresh,
  get count() {
    return itemCount();
  },
};
