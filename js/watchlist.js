// Watchlist page: reads the same "zevkev-watchlist" localStorage set that
// js/vods.js and js/youtube.js already write to (identical getWatchlist/
// saveWatchlist logic, confirmed by reading both files), then resolves each
// saved id against BOTH video feeds those pages fetch from, so a starred
// video shows up here no matter which page it was starred on.

const WATCHLIST_KEY = "zevkev-watchlist";

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

function getWatchlist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveWatchlist(set) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...set]));
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

function cardHTML(video) {
  const views = video.views != null ? formatViews(video.views) : "";
  return `
  <a href="${video.url}" target="_blank" rel="noopener" class="vod-card rip reveal" data-video-id="${video.id}">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      ${sourceBadgeHTML(video.source)}
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
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const list = getWatchlist();
      list.delete(btn.dataset.watchId);
      saveWatchlist(list);
      renderGrid();
    });
  });
}

// Order: most recently starred first. getWatchlist() returns a Set built
// from the stored array in insertion order, so reversing it surfaces the
// latest star at the top rather than the oldest.
function renderGrid() {
  if (!gridEl) return;
  const ids = [...getWatchlist()].reverse();
  const list = ids.map((id) => byId.get(id)).filter(Boolean);

  if (countEl) {
    countEl.textContent = list.length ? (list.length === 1 ? "1 gespeichertes Video" : `${list.length} gespeicherte Videos`) : "";
  }

  if (!list.length) {
    gridEl.innerHTML = emptyStateHTML();
    return;
  }
  gridEl.innerHTML = list.map((v) => cardHTML(v)).join("");
  attachHandlers();
}

async function init() {
  const [vodFeed, mainFeed] = await Promise.all([
    loadJSON("/assets/data/videos.json", { videos: [] }),
    loadJSON("/assets/data/main-videos.json", { videos: [] }),
  ]);

  byId = new Map();
  (vodFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: "vod" }));
  (mainFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: v.isShort ? "short" : "youtube" }));

  renderGrid();
}

init();
