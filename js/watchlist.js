// Watchlist page: reads the same watchlist store js/vods.js and js/youtube.js
// write to (js/user-data.js -- localStorage when logged out, synced through
// the visitor's account when logged in), then resolves each saved id
// against BOTH video feeds those pages fetch from, so a starred video shows
// up here no matter which page it was starred on.
import { auth, onAuthChange } from "./auth.js";
import { getWatchlistIds, toggleWatchlistId, getProgress } from "./user-data.js";
import { initReveal } from "./reveal.js";

const gridEl = document.getElementById("wl-grid");
const countEl = document.getElementById("wl-count");

// Same small icon set convention as vods.js/youtube.js: each page script
// owns its own copies rather than importing a shared module.
function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
}
function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function boltIcon(size = 11) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>`;
}
function emptyIcon() {
  return `<svg class="wl-empty-icon" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/></svg>`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatViews(n) {
  if (n == null || Number.isNaN(n)) return "";
  try {
    return new Intl.NumberFormat("de-DE").format(n);
  } catch {
    return String(n);
  }
}

let watchlistCache = new Set();
// video id -> progress record ({positionSeconds, watched}), only ever
// populated for signed-in visitors (see js/user-data.js's getProgress) --
// stays empty for anonymous visitors, who just get the plain list with no
// "angesehen" grouping instead of a broken/always-empty one.
let progressCache = new Map();

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

// Populated once in init() from both feeds, keyed by video id -> the video
// object plus a `source` tag ("vod" | "youtube" | "short") derived from
// which feed it came from and, for the main-channel feed, its own isShort
// flag. Re-read on every render so a re-render always reflects the current
// localStorage state (e.g. right after an un-star click).
let byId = new Map();

function sourceBadgeHTML(source) {
  if (source === "short") return `<span class="wl-source-badge wl-source-badge--short">${boltIcon()}Short</span>`;
  if (source === "youtube") return `<span class="wl-source-badge wl-source-badge--youtube">YouTube</span>`;
  return `<span class="wl-source-badge wl-source-badge--vod">VOD Kanal</span>`;
}

// Only "youtube"/"short" items (main-videos.json, the same feed js/youtube.js
// and js/watch.js use) have a real /video/<id>/ page to route through yet --
// the "vod" source is the separate ZevKev+ channel feed (videos.json) shown
// at the bottom of the Mehr page, which still links straight to YouTube.
// Watch progress can only ever be recorded for videos actually opened
// through js/watch.js, so "vod"-source cards never show a watched badge.
function progressKeyFor(video) {
  return video.source === "vod" ? null : `video:${video.id}`;
}

function cardHTML(video) {
  const views = video.views != null ? formatViews(video.views) : "";
  const key = progressKeyFor(video);
  const progress = key ? progressCache.get(key) : null;
  const href = key ? `/video/${video.id}/` : video.url;
  const linkAttrs = key ? "" : ` target="_blank" rel="noopener"`;
  return `
  <a href="${href}"${linkAttrs} class="vod-card rip reveal" data-video-id="${video.id}">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      ${sourceBadgeHTML(video.source)}
      ${progress?.watched ? `<span class="wl-watched-badge">${eyeIcon()}Angesehen</span>` : ""}
      <button class="watchlist-toggle is-saved" data-watch-id="${video.id}" aria-label="Von der Watchlist entfernen" onclick="event.preventDefault()">${starIcon(true)}</button>
    </div>
    <h3>${video.title}</h3>
    <div class="wl-card-meta">
      <span class="vod-date">${formatDate(video.publishedAt)}</span>
      ${views ? `<span class="wl-card-views">${eyeIcon()}${views}</span>` : ""}
    </div>
  </a>`;
}

function emptyStateHTML() {
  return `
  <div class="empty-state">
    ${emptyIcon()}
    <h2>Watchlist ist leer</h2>
    <p>Speicher Videos mit dem Stern auf den <a href="/vods/">VODs</a> oder <a href="/youtube/">YouTube</a> Seiten, um sie hier wiederzufinden.</p>
  </div>`;
}

function attachHandlers() {
  gridEl.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      watchlistCache = await toggleWatchlistId(btn.dataset.watchId);
      renderGrid();
    });
  });
}

// Order: most recently starred first (the stored array is in insertion
// order, reversing surfaces the latest star at the top). Signed-in
// visitors additionally get their list split into "Weiterschauen"/"Noch
// nicht angesehen" -- anonymous visitors have no progress data at all (see
// js/user-data.js), so they just get the plain list instead of a section
// header for a group that could never have anything in it.
function renderGrid() {
  if (!gridEl) return;
  const ids = [...watchlistCache].reverse();
  const list = ids.map((id) => byId.get(id)).filter(Boolean);

  if (countEl) {
    countEl.textContent = list.length ? (list.length === 1 ? "1 gespeichertes Video" : `${list.length} gespeicherte Videos`) : "";
  }

  if (!list.length) {
    gridEl.classList.add("vod-grid");
    gridEl.innerHTML = emptyStateHTML();
    return;
  }

  if (!auth.currentUser) {
    gridEl.classList.add("vod-grid");
    gridEl.innerHTML = list.map((v) => cardHTML(v)).join("");
    attachHandlers();
    initReveal(gridEl);
    return;
  }

  const watched = [];
  const unwatched = [];
  for (const v of list) {
    const key = progressKeyFor(v);
    (key && progressCache.get(key)?.watched ? watched : unwatched).push(v);
  }

  // #wl-grid itself is a plain wrapper in this branch -- the .vod-grid
  // (actual CSS grid) class moves to each .wl-subgrid sub-container instead,
  // since grouped mode needs the headings between them to sit in normal
  // block flow, not as grid items themselves.
  gridEl.classList.remove("vod-grid");
  gridEl.innerHTML = `
    ${unwatched.length ? `<h2 class="yt-section-title wl-group-title">Weiterschauen</h2><div class="vod-grid wl-subgrid">${unwatched.map((v) => cardHTML(v)).join("")}</div>` : ""}
    ${watched.length ? `<h2 class="yt-section-title wl-group-title">Angesehen</h2><div class="vod-grid wl-subgrid">${watched.map((v) => cardHTML(v)).join("")}</div>` : ""}`;
  attachHandlers();
  initReveal(gridEl);
}

// Re-run (not just re-rendered) whenever the signed-in uid actually changes
// -- watchlistCache/progressCache are account-specific, so a sign-in/out
// while already sitting on this page needs a real refetch, not just a
// re-render of whatever was loaded for the previous auth state. Real bug
// this replaced: the old code called getWatchlistIds() once up front and
// only ever re-rendered on auth changes afterward, which (combined with
// getWatchlistIds() reading auth.currentUser before Firebase had resolved
// the persisted session -- see authReady in js/auth.js) meant a returning
// signed-in visitor's real watchlist never loaded at all, permanently stuck
// showing the empty/local one instead.
let loadedForUid;

async function loadWatchlistData() {
  watchlistCache = await getWatchlistIds();
  progressCache = new Map();
  if (auth.currentUser) {
    for (const id of watchlistCache) {
      const key = `video:${id}`;
      const p = await getProgress(key);
      if (p) progressCache.set(key, p);
    }
  }
  renderGrid();
}

async function init() {
  // Safety net -- see the matching comment in js/youtube.js's init().
  try {
    const [vodFeed, mainFeed] = await Promise.all([
      loadJSON("/assets/data/videos.json", { videos: [] }),
      loadJSON("/assets/data/main-videos.json", { videos: [] }),
    ]);

    byId = new Map();
    (vodFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: "vod" }));
    (mainFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: v.isShort ? "short" : "youtube" }));

    onAuthChange((user) => {
      const uid = user ? user.uid : null;
      if (loadedForUid === uid) return;
      loadedForUid = uid;
      loadWatchlistData();
    });
  } catch (err) {
    console.error("Watchlist page init failed:", err);
    if (gridEl) gridEl.innerHTML = `<div class="empty-state"><h2>Etwas ist schiefgelaufen</h2><p>Bitte lade die Seite neu.</p></div>`;
  }
}

init();
