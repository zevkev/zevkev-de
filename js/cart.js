import { FourthwallAPI } from "./fourthwall-api.js";

const STORAGE_KEY = "zevkev-cart-id";

function money(amount, currency) {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`;
  }
}

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
    items.innerHTML = `<p class="cart-empty">Dein Warenkorb ist leer.<br>Schau dich im <a href="/shop/">Shop</a> um!</p>`;
    if (footer) footer.style.display = "none";
    return;
  }

  items.innerHTML = lineItems
    .map((it) => {
      const img = it.variant?.image?.url || it.product?.image?.url || "";
      const name = it.product?.name || it.variant?.name || "Artikel";
      const attrs = (it.variant?.attributes?.values || []).map((v) => v.value).join(" / ");
      const price = money(it.unitPrice?.value ?? 0, it.unitPrice?.currency);
      return `
      <div class="cart-item" data-item-id="${it.id}">
        ${img ? `<img src="${img}" alt="">` : ""}
        <div class="cart-item-info">
          <div class="name">${name}</div>
          ${attrs ? `<div class="attrs">${attrs}</div>` : ""}
          <div class="attrs">${it.quantity} &times; ${price}</div>
        </div>
        <button class="cart-item-remove" data-remove="${it.id}">Entfernen</button>
      </div>`;
    })
    .join("");

  if (footer) footer.style.display = "block";
  if (subtotal) subtotal.textContent = money(state.cart?.subtotal?.value ?? 0, state.cart?.subtotal?.currency);
  if (checkout) checkout.href = state.cart?.checkoutUrl || "#";

  items.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(btn.getAttribute("data-remove")));
  });
}

async function refreshFromApi() {
  const id = localStorage.getItem(STORAGE_KEY);
  if (!id) return;
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
      const existing = state.cart?.items || [];
      const items = [...existing.map((it) => ({ variantId: it.variant.id, quantity: it.quantity }))];
      const match = items.find((it) => it.variantId === variantId);
      if (match) match.quantity += quantity;
      else items.push({ variantId, quantity });
      state.cart = await FourthwallAPI.updateCart(id, items);
    }
    render();
    showToast("In den Warenkorb gelegt.");
    openDrawer();
  } catch (err) {
    console.error("Add to cart failed:", err);
    showToast("Konnte nicht zum Warenkorb hinzugefügt werden.");
  }
}

async function removeItem(itemId) {
  const id = localStorage.getItem(STORAGE_KEY);
  if (!id || !state.cart) return;
  const items = state.cart.items
    .filter((it) => it.id !== itemId)
    .map((it) => ({ variantId: it.variant.id, quantity: it.quantity }));
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
