import { FourthwallAPI } from "./fourthwall-api.js";
import { money } from "./currency.js";
import { track } from "./track.js";

const STORAGE_KEY = "zevkev-cart-id";
// Fourthwall's hosted checkout lives on whichever domain is connected as
// this shop's custom domain in Settings → Domain (confirmed live there as
// "shop.zevkev.me — Connected"). This is deliberately the shop subdomain,
// not the zevkev.me apex — the apex redirects to zevkev.de, so pointing
// checkout at it would loop. Keep in sync if the connected domain changes.
const CHECKOUT_DOMAIN = "shop.zevkev.me";

function showToast(text) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("is-visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

let state = { cart: null };

function els() {
  return {
    badge: document.getElementById("cart-badge"),
    items: document.getElementById("cart-items"),
    footer: document.getElementById("cart-footer"),
    subtotal: document.getElementById("cart-subtotal"),
    checkout: document.getElementById("cart-checkout"),
    drawer: document.getElementById("cart-drawer"),
    backdrop: document.getElementById("cart-backdrop"),
  };
}

function computeSubtotal(lineItems) {
  if (!lineItems.length) return { value: 0, currency: "USD" };
  const currency = lineItems[0].variant?.unitPrice?.currency || "USD";
  const value = lineItems.reduce((sum, it) => sum + (it.variant?.unitPrice?.value ?? 0) * (it.quantity || 0), 0);
  return { value, currency };
}

// cartCurrency is hardcoded to EUR (not the cart/API's own currency, which
// is always USD — see js/currency.js) — verified directly against a real
// test cart on Fourthwall's hosted checkout: cartCurrency=EUR makes the
// checkout's own order summary display (and, per Fourthwall's "Local
// currencies" feature, already confirmed enabled for EUR in their
// Settings → Checkout, actually charge) in EUR, vs. cartCurrency=USD or no
// param at all, both of which showed USD even for a Germany-detected
// visitor. This site is exclusively for a German audience, so EUR is
// always correct here.
function checkoutUrl(cartId) {
  return `https://${CHECKOUT_DOMAIN}/checkout/?cartCurrency=EUR&cartId=${encodeURIComponent(cartId)}`;
}

function render() {
  const { badge, items, footer, subtotal, checkout } = els();
  const lineItems = state.cart?.items || [];
  const count = lineItems.reduce((sum, it) => sum + (it.quantity || 0), 0);

  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle("is-visible", count > 0);
  }
  if (!items) return;

  if (!lineItems.length) {
    items.innerHTML = `
      <div class="cart-empty">
        <svg class="cart-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg>
        <p class="cart-empty-title">Dein Warenkorb ist leer.</p>
        <p class="cart-empty-text">Schau dich im Shop um!</p>
        <a href="/shop/" class="p-btn rip btn-accent cart-empty-cta" data-track-click="cart-empty-go-shop">Zum Shop</a>
      </div>`;
    if (footer) footer.style.display = "none";
    return;
  }

  items.innerHTML = lineItems
    .map((it) => {
      const v = it.variant || {};
      const img = v.images?.[0]?.url || "";
      const name = v.product?.name || v.name || "Artikel";
      const attrs = v.attributes?.description || "";
      const qty = it.quantity || 0;
      const unit = v.unitPrice?.value ?? 0;
      const currency = v.unitPrice?.currency;
      const unitPrice = money(unit, currency);
      const lineTotal = money(unit * qty, currency);
      return `
      <div class="cart-item rip" data-variant-id="${v.id}">
        ${img ? `<img src="${img}" alt="">` : ""}
        <div class="cart-item-info">
          <div class="cart-item-name">${name}</div>
          ${attrs ? `<div class="cart-item-attrs">${attrs}</div>` : ""}
          <div class="cart-item-meta">
            ${qty > 1 ? `<span class="cart-item-qty">${qty} &times; ${unitPrice}</span>` : ""}
            <span class="cart-item-total">${lineTotal}</span>
          </div>
        </div>
        <button class="cart-item-remove" data-remove="${v.id}" aria-label="${name} entfernen" title="Entfernen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>`;
    })
    .join("");

  const sub = computeSubtotal(lineItems);
  if (footer) footer.style.display = "block";
  if (subtotal) subtotal.textContent = money(sub.value, sub.currency);
  if (checkout) checkout.href = state.cart?.id ? checkoutUrl(state.cart.id) : "#";

  items.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(btn.getAttribute("data-remove")));
  });
}

function itemsForUpdate() {
  return (state.cart?.items || []).map((it) => ({ variantId: it.variant.id, quantity: it.quantity }));
}

async function refreshFromApi() {
  const id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    render();
    return;
  }
  try {
    state.cart = await FourthwallAPI.getCart(id);
  } catch (err) {
    console.error("Cart load failed, starting fresh:", err);
    localStorage.removeItem(STORAGE_KEY);
    state.cart = null;
  }
  render();
}

async function addItem(variantId, quantity = 1) {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      state.cart = await FourthwallAPI.createCart([{ variantId, quantity }]);
      localStorage.setItem(STORAGE_KEY, state.cart.id);
    } else {
      const items = itemsForUpdate();
      const match = items.find((it) => it.variantId === variantId);
      if (match) match.quantity += quantity;
      else items.push({ variantId, quantity });
      state.cart = await FourthwallAPI.updateCart(id, items);
    }
    render();
    showToast("In den Warenkorb gelegt.");
    openDrawer();
    track("add_to_cart", variantId, quantity);
  } catch (err) {
    console.error("Add to cart failed:", err);
    showToast("Konnte nicht zum Warenkorb hinzugefügt werden.");
  }
}

async function removeItem(variantId) {
  const id = localStorage.getItem(STORAGE_KEY);
  if (!id || !state.cart) return;
  const items = itemsForUpdate().filter((it) => it.variantId !== variantId);
  try {
    state.cart = await FourthwallAPI.updateCart(id, items);
    render();
  } catch (err) {
    console.error("Remove item failed:", err);
  }
}

function openDrawer() {
  els().drawer?.classList.add("is-open");
  els().backdrop?.classList.add("is-open");
  els().drawer?.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els().drawer?.classList.remove("is-open");
  els().backdrop?.classList.remove("is-open");
  els().drawer?.setAttribute("aria-hidden", "true");
}

export const Cart = {
  init: refreshFromApi,
  addItem,
  removeItem,
  openDrawer,
  closeDrawer,
};
