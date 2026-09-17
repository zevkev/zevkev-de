// Shared header + footer, mounted into #site-header / #site-footer on every
// page. The cart icon/drawer only ever appears on /shop/ pages.
import { track } from "/js/track.js";
import { mountConsentBanner } from "/js/consent.js";

const NAV = [
  { href: "/", label: "Home", match: (p) => p === "/" || p === "/index.html" },
  { href: "/shop/", label: "Shop", match: (p) => p.startsWith("/shop") },
  { href: "/youtube/", label: "YouTube", match: (p) => p.startsWith("/youtube") },
  { href: "/vods/", label: "Mehr", match: (p) => p.startsWith("/vods") },
  { href: "/watchlist/", label: "Watchlist", match: (p) => p.startsWith("/watchlist") },
];

// Same key js/youtube.js, js/vods.js and js/watchlist.js read/write. Checked
// once per page load (not reactively) to decide whether the Watchlist nav
// item is even worth showing -- an empty watchlist isn't a useful
// destination, so the tab stays hidden until there's actually something
// saved on it.
const WATCHLIST_KEY = "zevkev-watchlist";
function hasWatchlistItems() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]").length > 0;
  } catch {
    return false;
  }
}

const SOCIALS = [
  { href: "https://www.youtube.com/@ZevKev", label: "YouTube", icon: "youtube" },
  { href: "https://www.instagram.com/zevkev/", label: "Instagram", icon: "instagram" },
  { href: "https://www.tiktok.com/@zevkev", label: "TikTok", icon: "tiktok" },
  { href: "https://discord.com/invite/psW4NgjBFN", label: "Discord", icon: "discord" },
  { href: "https://www.twitch.tv/zevkev_", label: "Twitch", icon: "twitch", twitchOnly: true },
];

const ICONS = {
  youtube: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
  instagram: '<path d="M7.03.084c-1.277.06-2.149.264-2.911.563-.789.308-1.458.72-2.123 1.388-.665.668-1.075 1.337-1.38 2.127-.295.764-.496 1.636-.552 2.914C.05 8.253.037 8.664.043 11.923c.006 3.259.021 3.667.083 4.947.06 1.277.264 2.148.563 2.911.309.789.72 1.457 1.388 2.123.668.665 1.337 1.074 2.129 1.38.763.295 1.636.496 2.913.552 1.277.056 1.689.069 4.947.063 3.257-.006 3.667-.021 4.947-.081 1.28-.061 2.147-.266 2.91-.564.789-.309 1.458-.72 2.123-1.388.665-.668 1.074-1.337 1.379-2.129.296-.763.497-1.636.552-2.912.056-1.281.069-1.69.063-4.948-.006-3.258-.021-3.667-.082-4.947-.06-1.28-.264-2.149-.563-2.912-.309-.789-.72-1.457-1.387-2.123C21.298 1.33 20.628.92 19.838.616 19.074.32 18.202.119 16.924.064 15.647.009 15.236-.005 11.977.001 8.718.007 8.31.022 7.03.084M7.17 21.776c-1.17-.051-1.805-.245-2.229-.408-.56-.216-.96-.477-1.382-.895-.422-.418-.681-.819-.9-1.378-.164-.423-.362-1.058-.417-2.228-.06-1.264-.072-1.644-.079-4.848-.007-3.204.005-3.583.061-4.848.05-1.169.246-1.805.408-2.228.216-.561.476-.96.895-1.382.419-.422.818-.681 1.378-.9.423-.165 1.057-.361 2.227-.417 1.265-.06 1.644-.072 4.848-.079 3.203-.007 3.583.005 4.848.061 1.169.053 1.805.246 2.228.408.56.216.96.475 1.382.895.422.419.681.818.9 1.378.165.422.361 1.056.417 2.226.06 1.265.074 1.645.079 4.848.005 3.203-.006 3.584-.062 4.848-.052 1.17-.246 1.805-.408 2.229-.216.56-.477.96-.895 1.382-.419.421-.818.68-1.378.899-.422.165-1.058.362-2.226.418-1.265.06-1.645.072-4.849.079-3.204.007-3.582-.006-4.848-.062M15.947 5.586a1.44 1.44 0 1 0 1.437-1.442 1.44 1.44 0 0 0-1.437 1.442M5.839 12a6.161 6.161 0 1 0 12.323-.001 6.161 6.161 0 0 0-12.323.001M8 12a4 4 0 1 1 4 4 4 4 0 0 1-4-4"/>',
  tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  discord: '<path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25-1.845-.276-3.68-.276-5.487 0-.163-.393-.406-.874-.618-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.319 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.245.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.834 19.834 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.673-3.548-13.66a.061.061 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.956-2.42 2.157-2.42 1.211 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42m7.974 0c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42"/>',
  twitch: '<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>',
};

function themeIconHTML() {
  return `
  <span class="theme-toggle-scene">
    <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4V2M12 22v-2M4.93 4.93 3.51 3.51M20.49 20.49l-1.42-1.42M4 12H2M22 12h-2M4.93 19.07l-1.42 1.42M20.49 3.51l-1.42 1.42"/><circle cx="12" cy="12" r="5"/></svg>
    <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/><circle cx="17" cy="7" r=".6" fill="currentColor" stroke="none"/><circle cx="14" cy="4" r=".4" fill="currentColor" stroke="none"/></svg>
  </span>`;
}

function socialLinksHTML() {
  return SOCIALS.map(
    (s) => `<a href="${s.href}" target="_blank" rel="noopener" aria-label="${s.label}" data-track-click="social-${s.icon}"${s.twitchOnly ? " data-twitch-only" : ""}><svg viewBox="0 0 24 24" fill="currentColor">${ICONS[s.icon]}</svg></a>`
  ).join("");
}

function headerHTML(isShop) {
  return `
  <header class="site-header">
    <div class="container">
      <a class="site-logo" href="/">
        <img src="https://zevkev.github.io/Medienspeicher/Bilder/neues%20icon.png" alt="">
        ZevKev
      </a>
      <nav class="site-nav" id="site-nav">
        ${NAV.map((n) => `<a href="${n.href}" data-nav="${n.label}"${n.href === "/vods/" ? " data-twitch-optional" : ""}>${n.label}</a>`).join("")}
      </nav>
      <div class="header-actions" id="header-actions">
        <button class="theme-toggle" id="theme-toggle" aria-label="Dunkles Design umschalten" type="button">${themeIconHTML()}</button>
        ${isShop ? cartButtonHTML() : ""}
        <div id="account-slot"></div>
        <button class="nav-toggle" id="nav-toggle" aria-label="Menü öffnen" aria-expanded="false"><span></span></button>
      </div>
    </div>
  </header>`;
}

function cartButtonHTML() {
  return `
  <button class="cart-button" id="cart-open" aria-label="Warenkorb öffnen">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg>
    <span class="cart-badge" id="cart-badge">0</span>
  </button>`;
}

function cartDrawerHTML() {
  return `
  <div class="cart-backdrop" id="cart-backdrop"></div>
  <aside class="cart-drawer" id="cart-drawer" aria-hidden="true">
    <div class="cart-drawer-header">
      <h2>Warenkorb</h2>
      <button class="cart-close" id="cart-close" aria-label="Schließen">&times;</button>
    </div>
    <div class="cart-items" id="cart-items"></div>
    <div class="receipt-tear"></div>
    <div class="cart-footer" id="cart-footer" style="display:none;">
      <div class="cart-subtotal">
        <span class="cart-subtotal-label">Zwischensumme</span>
        <span class="cart-subtotal-value" id="cart-subtotal">0,00 €</span>
      </div>
      <p class="cart-shipping-note">zzgl. Versandkosten</p>
      <a class="p-btn rip btn-accent" id="cart-checkout" data-track-click="cart-checkout" style="width:100%; justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        Zur Kasse
      </a>
    </div>
  </aside>`;
}

function footerHTML() {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-socials">${socialLinksHTML()}</div>
      <div class="footer-links">
        <a href="/">Home</a>
        <a href="/shop/">Shop</a>
        <a href="/youtube/">YouTube</a>
        <a href="/vods/">Mehr</a>
        <a href="/watchlist/" id="footer-watchlist-link">Watchlist</a>
        <a href="/impressum/">Impressum</a>
        <a href="/datenschutz/">Datenschutz</a>
        <a href="/kontakt/">Kontakt</a>
        <a href="#" id="cookie-settings-link">Cookie-Einstellungen</a>
      </div>
      <p class="footer-note">&copy; ${new Date().getFullYear()} ZevKev. Videos und Entertainment.</p>
    </div>
  </footer>`;
}

export async function mountLayout() {
  const path = window.location.pathname;
  const isShop = path.startsWith("/shop");

  track("page_view", path);

  const headerSlot = document.getElementById("site-header");
  const footerSlot = document.getElementById("site-footer");
  if (headerSlot) headerSlot.outerHTML = headerHTML(isShop) + (isShop ? cartDrawerHTML() : "");
  if (footerSlot) footerSlot.outerHTML = footerHTML();

  mountConsentBanner();
  import("/js/auth-ui.js").then(({ mountAccountUI }) => mountAccountUI());
  document.getElementById("cookie-settings-link")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const { openConsentSettings } = await import("/js/consent.js");
    openConsentSettings();
  });

  const { getTheme, toggleTheme } = await import("/js/theme.js");
  const themeBtn = document.getElementById("theme-toggle");
  const syncThemeIcon = () => themeBtn?.classList.toggle("is-dark", getTheme() === "dark");
  syncThemeIcon();
  themeBtn?.addEventListener("click", () => {
    toggleTheme();
    syncThemeIcon();
  });

  const nav = document.getElementById("site-nav");
  const active = NAV.find((n) => n.match(path));
  if (active) nav.querySelector(`[data-nav="${active.label}"]`)?.classList.add("is-active");

  if (!hasWatchlistItems()) {
    nav.querySelector('[data-nav="Watchlist"]')?.remove();
    document.getElementById("footer-watchlist-link")?.remove();
  }

  const toggle = document.getElementById("nav-toggle");
  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
    nav.classList.remove("is-open");
    toggle?.setAttribute("aria-expanded", "false");
  }));

  if (isShop) {
    const { Cart } = await import("/js/cart.js");
    document.getElementById("cart-open")?.addEventListener("click", () => Cart.openDrawer());
    document.getElementById("cart-close")?.addEventListener("click", () => Cart.closeDrawer());
    document.getElementById("cart-backdrop")?.addEventListener("click", () => Cart.closeDrawer());
    Cart.init();
  }
}
