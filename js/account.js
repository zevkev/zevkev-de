// Account page (/account/): profile (avatar + rename), watchlist overview,
// and account deletion. Owner-agnostic -- any signed-in visitor sees their
// own account here, not just kevlevin.zev@gmail.com (that's /privat/'s job).
import { auth, onAuthChange, updateDisplayName, deleteAccount, avatarColorFor, signOutUser, authErrorMessage } from "./auth.js";
import { getWatchlistIds, toggleWatchlistId } from "./user-data.js";

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function lockIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
}
function logoutIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`;
}
function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
}
function emptyIcon() {
  return `<svg class="wl-empty-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/></svg>`;
}
function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

async function loadJSON(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (err) {
    console.warn(`Could not load ${url}:`, err);
    return fallback;
  }
}

function gateHTML() {
  return `
  <div class="empty-state notfound-state">
    <div class="notfound-icon">${lockIcon()}</div>
    <h2>Anmeldung erforderlich</h2>
    <p>Melde dich an, um dein Konto zu sehen.</p>
    <button type="button" class="p-btn rip btn-accent" id="account-login-btn">Anmelden</button>
  </div>`;
}

function profileHTML(user) {
  const name = user.displayName || user.email?.split("@")[0] || "Account";
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return `
  <div class="account-avatar-lg" style="background:${avatarColorFor(user.uid)}">${escapeHTML(letter)}</div>
  <div class="account-info">
    <form class="account-name-form" id="account-name-form">
      <label for="account-name-input">Username</label>
      <div class="account-name-row">
        <input type="text" id="account-name-input" value="${escapeHTML(name)}" maxlength="24" required autocomplete="nickname">
        <button type="submit" class="p-btn rip btn-accent">Speichern</button>
      </div>
      <p class="auth-error" id="account-name-error"></p>
      <p class="account-name-saved" id="account-name-saved">Gespeichert.</p>
    </form>
    <p class="account-email">${escapeHTML(user.email || "")}</p>
  </div>
  <button type="button" class="account-logout" id="account-logout-btn" aria-label="Abmelden" title="Abmelden">${logoutIcon()}</button>`;
}

function dangerHTML() {
  return `
  <div class="account-danger-box">
    <h2 class="yt-section-title" style="margin-top:0;">Konto löschen</h2>
    <p>Löscht dein Konto, deinen reservierten Username und deine Watchlist dauerhaft. Bereits geschriebene Kommentare bleiben stehen (können aber weiterhin von dir oder ZevKev entfernt werden). Das kann nicht rückgängig gemacht werden.</p>
    <p class="auth-error" id="account-delete-error"></p>
    <button type="button" class="p-btn rip" id="account-delete-btn">Konto endgültig löschen</button>
  </div>`;
}

let byId = new Map();
let watchlistCache = new Set();

function wlCardHTML(video) {
  const source = video.source === "vod" ? null : `video:${video.id}`;
  const href = source ? `/video/${video.id}/` : video.url;
  const linkAttrs = source ? "" : ` target="_blank" rel="noopener"`;
  return `
  <a href="${href}"${linkAttrs} class="vod-card rip reveal" data-video-id="${video.id}">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      <button class="watchlist-toggle is-saved" data-watch-id="${video.id}" aria-label="Von der Watchlist entfernen" onclick="event.preventDefault()">${starIcon(true)}</button>
    </div>
    <h3>${escapeHTML(video.title)}</h3>
    <div class="vod-date">${formatDate(video.publishedAt)}</div>
  </a>`;
}

function renderWatchlist() {
  const grid = document.getElementById("account-wl-grid");
  const countEl = document.getElementById("account-wl-count");
  if (!grid) return;
  const ids = [...watchlistCache].reverse();
  const list = ids.map((id) => byId.get(id)).filter(Boolean);
  if (countEl) countEl.textContent = list.length ? `(${list.length})` : "";

  if (!list.length) {
    grid.innerHTML = `
    <div class="empty-state">
      ${emptyIcon()}
      <h2>Watchlist ist leer</h2>
      <p>Speicher Videos mit dem Stern auf den <a href="/vods/">VODs</a> oder <a href="/youtube/">YouTube</a> Seiten.</p>
    </div>`;
    return;
  }
  grid.innerHTML = list.map(wlCardHTML).join("") + `<a href="/watchlist/" class="account-wl-more rip">Ganze Watchlist ansehen &rarr;</a>`;
  grid.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      watchlistCache = await toggleWatchlistId(btn.dataset.watchId);
      renderWatchlist();
    });
  });
}

async function loadWatchlist() {
  const [vodFeed, mainFeed] = await Promise.all([
    loadJSON("/assets/data/videos.json", { videos: [] }),
    loadJSON("/assets/data/main-videos.json", { videos: [] }),
    getWatchlistIds().then((set) => (watchlistCache = set)),
  ]);
  byId = new Map();
  (vodFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: "vod" }));
  (mainFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: v.isShort ? "short" : "youtube" }));
  renderWatchlist();
}

function wireProfile(user) {
  const form = document.getElementById("account-name-form");
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = document.getElementById("account-name-input");
    const errorEl = document.getElementById("account-name-error");
    const savedEl = document.getElementById("account-name-saved");
    const submitBtn = form.querySelector('button[type="submit"]');
    errorEl.textContent = "";
    savedEl.classList.remove("is-visible");
    const value = input.value.trim();
    if (!value) {
      errorEl.textContent = "Bitte einen Username eingeben.";
      return;
    }
    submitBtn.disabled = true;
    try {
      await updateDisplayName(value);
      savedEl.classList.add("is-visible");
      setTimeout(() => savedEl.classList.remove("is-visible"), 2500);
      // Re-render the avatar letter/header slot too, in case the first
      // letter changed -- same "listener won't fire again for a profile-
      // field-only change" reasoning as auth-ui.js's own refreshAccountSlot.
      renderProfile(auth.currentUser);
      const { refreshAccountSlot } = await import("./auth-ui.js");
      refreshAccountSlot();
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("account-logout-btn")?.addEventListener("click", () => signOutUser());
}

function renderProfile(user) {
  const el = document.getElementById("account-profile");
  if (!el) return;
  el.innerHTML = profileHTML(user);
  wireProfile(user);
}

function wireDanger() {
  document.getElementById("account-delete-btn")?.addEventListener("click", async (ev) => {
    const errorEl = document.getElementById("account-delete-error");
    errorEl.textContent = "";
    if (!confirm("Konto wirklich unwiderruflich löschen?")) return;
    ev.target.disabled = true;
    try {
      await deleteAccount();
      location.href = "/";
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
      ev.target.disabled = false;
    }
  });
}

let loadedForUid = null;

onAuthChange((user) => {
  const gate = document.getElementById("account-gate");
  const app = document.getElementById("account-app");
  if (!user) {
    loadedForUid = null;
    app.style.display = "none";
    gate.innerHTML = gateHTML();
    gate.querySelector("#account-login-btn")?.addEventListener("click", async () => {
      const { openAuthModal } = await import("./auth-ui.js");
      openAuthModal();
    });
    return;
  }

  gate.innerHTML = "";
  app.style.display = "";
  renderProfile(user);
  document.getElementById("account-danger").innerHTML = dangerHTML();
  wireDanger();

  if (loadedForUid !== user.uid) {
    loadedForUid = user.uid;
    loadWatchlist();
  }
});
