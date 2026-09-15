// Shared header + footer, mounted into #site-header / #site-footer on every page.
// The cart icon/drawer only ever appears on /shop/ pages — everywhere else the
// header is just logo + nav, so cart.js is never even fetched off the shop page.

const NAV = [
  { href: "/", label: "Home", match: (p) => p === "/" || p === "/index.html" },
  { href: "/shop/", label: "Shop", match: (p) => p.startsWith("/shop") },
  { href: "/vods/", label: "VODs", match: (p) => p.startsWith("/vods") },
];

function headerHTML(isShop) {
  return `
  <header class="site-header rip rip--accent">
    <div class="tape header-tape"></div>
    <div class="container">
      <a class="site-logo" href="/">
        <img src="https://zevkev.github.io/Medienspeicher/Bilder/neues%20icon.png" alt="" width="34" height="34">
        ZevKev
      </a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Menü öffnen" aria-expanded="false">&#9776;</button>
      <nav class="site-nav" id="site-nav">
        ${NAV.map((n) => `<a href="${n.href}" data-nav="${n.label}">${n.label}</a>`).join("")}
      </nav>
      <div class="header-actions" id="header-actions">
        ${isShop ? cartButtonHTML() : ""}
      </div>
    </div>
  </header>`;
}

function cartButtonHTML() {
  return `
  <button class="cart-button rip rip--accent" id="cart-open" aria-label="Warenkorb öffnen">
    <svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg>
    <span class="cart-badge" id="cart-badge">0</span>
  </button>`;
}

function cartDrawerHTML() {
  return `
  <div class="cart-backdrop" id="cart-backdrop"></div>
  <aside class="cart-drawer rip" id="cart-drawer" aria-hidden="true">
    <div class="cart-drawer-header">
      <h2>Dein Warenkorb</h2>
      <button class="cart-close" id="cart-close" aria-label="Schließen">&times;</button>
    </div>
    <div class="cart-items" id="cart-items"></div>
    <div class="receipt-tear"></div>
    <div class="cart-footer" id="cart-footer" style="display:none;">
      <div class="cart-subtotal"><span>Zwischensumme</span><span id="cart-subtotal">0,00 €</span></div>
      <a class="p-btn rip btn-accent" id="cart-checkout" style="width:100%; justify-content:center;">Zur Kasse</a>
    </div>
  </aside>`;
}

function footerHTML() {
  return `
  <div class="scissor-line"></div>
  <footer class="site-footer rip rip--accent">
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/shop/">Shop</a>
      <a href="/vods/">VODs</a>
      <a href="/impressum/">Impressum</a>
      <a href="/datenschutz/">Datenschutz</a>
      <a href="/kontakt/">Kontakt</a>
    </div>
    <p class="footer-note">&copy; ${new Date().getFullYear()} ZevKev &middot; Freizeitparks, Vlogs &amp; Live auf Twitch.</p>
  </footer>`;
}

export async function mountLayout() {
  const path = window.location.pathname;
  const isShop = path.startsWith("/shop");

  const headerSlot = document.getElementById("site-header");
  const footerSlot = document.getElementById("site-footer");
  if (headerSlot) headerSlot.outerHTML = headerHTML(isShop) + (isShop ? cartDrawerHTML() : "");
  if (footerSlot) footerSlot.outerHTML = footerHTML();

  const nav = document.getElementById("site-nav");
  const active = NAV.find((n) => n.match(path));
  if (active) nav.querySelector(`[data-nav="${active.label}"]`)?.classList.add("is-active");

  document.getElementById("nav-toggle")?.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    document.getElementById("nav-toggle").setAttribute("aria-expanded", String(open));
  });

  if (isShop) {
    const { Cart } = await import("/js/cart.js");
    document.getElementById("cart-open")?.addEventListener("click", () => Cart.openDrawer());
    document.getElementById("cart-close")?.addEventListener("click", () => Cart.closeDrawer());
    document.getElementById("cart-backdrop")?.addEventListener("click", () => Cart.closeDrawer());
    Cart.init();
  }
}
