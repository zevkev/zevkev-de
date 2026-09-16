const WATCHLIST_KEY = "zevkev-watchlist";

const featuredEl = document.getElementById("yt-featured");
const gridEl = document.getElementById("yt-grid");
const filterBarEl = document.getElementById("yt-filter-bar");

function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
}
function playIcon(size = 15) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
}
function boltIcon(size = 14) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>`;
}
function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function emptyIcon() {
  return `<svg class="yt-empty-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M10 9.3v5.4l4.5-2.7Z" fill="currentColor" stroke="none"/></svg>`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
function toggleWatchlist(id) {
  const list = getWatchlist();
  if (list.has(id)) list.delete(id);
  else list.add(id);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...list]));
  return list;
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

/* ---------- Video modal ----------
   A custom-styled, on-brand launcher (play-button card) opens this instead
   of sending people straight to youtube.com. Actual playback is still a
   real YouTube iframe embed under the hood (per YouTube's terms), just
   presented in the site's own torn-paper chrome. Reuses .cart-backdrop /
   .qv-panel / .qv-close (already loaded via style.css + shop.css) for the
   floating-panel shell, matching the shop's quick-view exactly. */
let modalLastFocused = null;

function videoModalHTML(video) {
  return `
  <div class="qv-panel rip yt-modal-panel">
    <button class="cart-close qv-close" id="yt-modal-close" aria-label="Schließen">&times;</button>
    <div class="yt-modal-frame">
      <iframe
        src="https://www.youtube.com/embed/${video.id}?autoplay=1"
        title="${escapeHTML(video.title)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>
    </div>
    <div class="yt-modal-title">${video.title}</div>
  </div>`;
}

function onModalKeydown(ev) {
  if (ev.key === "Escape") closeVideoModal();
}

function closeVideoModal() {
  const modal = document.getElementById("yt-video-modal");
  if (!modal) return;
  modal.remove();
  document.removeEventListener("keydown", onModalKeydown);
  modalLastFocused?.focus?.();
}

function openVideoModal(video) {
  closeVideoModal();
  modalLastFocused = document.activeElement;

  const modal = document.createElement("div");
  modal.id = "yt-video-modal";
  modal.className = "cart-backdrop is-open";
  modal.innerHTML = videoModalHTML(video);
  document.body.appendChild(modal);

  modal.querySelector("#yt-modal-close").addEventListener("click", closeVideoModal);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeVideoModal();
  });
  document.addEventListener("keydown", onModalKeydown);
  modal.querySelector("#yt-modal-close").focus();
}

function renderFeatured(video) {
  if (!featuredEl) return;
  if (!video) {
    featuredEl.innerHTML = `<div class="empty-state">${emptyIcon()}<h2>Noch keine Videos geladen</h2><p>Schau bald wieder vorbei.</p></div>`;
    return;
  }
  const meta = [formatDate(video.publishedAt), video.views != null ? `${formatViews(video.views)} Aufrufe` : ""].filter(Boolean).join(" &middot; ");
  featuredEl.innerHTML = `
    <div class="yt-featured-eyebrow">${video.isShort ? "Neuestes Short" : "Neuestes Video"}</div>
    <div class="yt-featured-frame rip">
      <iframe
        src="https://www.youtube.com/embed/${video.id}"
        title="${escapeHTML(video.title)}"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>
    </div>
    <div class="yt-featured-body">
      <div class="yt-featured-title">${video.title}</div>
      ${meta ? `<div class="yt-featured-meta">${meta}</div>` : ""}
    </div>`;
}

function cardHTML(video, watchlist, isShort) {
  const saved = watchlist.has(video.id);
  const views = video.views != null ? formatViews(video.views) : "";
  return `
  <a href="${video.url}" target="_blank" rel="noopener" class="vod-card rip reveal${isShort ? " vod-card--short" : ""}" data-video-id="${video.id}">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      <span class="yt-play-overlay" aria-hidden="true"><span class="yt-play-circle">${playIcon(20)}</span></span>
      ${isShort ? `<span class="yt-short-badge">${boltIcon(11)}Short</span>` : ""}
      <button class="watchlist-toggle${saved ? " is-saved" : ""}" data-watch-id="${video.id}" aria-label="Zur Watchlist" onclick="event.preventDefault()">${starIcon(saved)}</button>
    </div>
    <h3>${video.title}</h3>
    <div class="yt-card-meta">
      <span class="vod-date">${formatDate(video.publishedAt)}</span>
      ${views ? `<span class="yt-card-views">${eyeIcon()}${views}</span>` : ""}
    </div>
  </a>`;
}

function renderGrid(videos, mode) {
  if (!gridEl) return;
  const list = mode === "shorts" ? videos.filter((v) => v.isShort) : videos.filter((v) => !v.isShort);
  gridEl.classList.toggle("yt-grid--shorts", mode === "shorts");

  if (!list.length) {
    gridEl.innerHTML = `<div class="empty-state">${emptyIcon()}<h2>${mode === "shorts" ? "Noch keine Shorts" : "Noch keine Videos"}</h2><p>Schau bald wieder vorbei.</p></div>`;
    return;
  }
  const watchlist = getWatchlist();
  gridEl.innerHTML = list.map((v) => cardHTML(v, watchlist, mode === "shorts")).join("");

  gridEl.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const updated = toggleWatchlist(btn.dataset.watchId);
      const isSaved = updated.has(btn.dataset.watchId);
      btn.classList.toggle("is-saved", isSaved);
      btn.innerHTML = starIcon(isSaved);
    });
  });

  // Cards open the custom video modal on a plain click. Ctrl/Cmd/Shift/Alt
  // click (and middle-click, which never fires "click") are left alone so
  // "open in new tab" still works via the real href underneath.
  gridEl.querySelectorAll(".vod-card").forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      const video = list.find((v) => v.id === card.dataset.videoId);
      if (video) openVideoModal(video);
    });
  });
}

function mountFilters(videos) {
  if (!filterBarEl) return;
  const videoCount = videos.filter((v) => !v.isShort).length;
  const shortsCount = videos.filter((v) => v.isShort).length;
  filterBarEl.innerHTML = `
    <button class="filter-pill rip rip--accent is-active" data-mode="videos">${playIcon()}Videos${videoCount ? ` (${videoCount})` : ""}</button>
    <button class="filter-pill rip" data-mode="shorts">${boltIcon()}Shorts${shortsCount ? ` (${shortsCount})` : ""}</button>`;
  filterBarEl.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      filterBarEl.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      renderGrid(videos, pill.dataset.mode);
    });
  });
}

async function init() {
  // main-videos.json mirrors YouTube's public RSS feed (feeds/videos.xml),
  // which YouTube itself caps at the channel's ~15 most recent uploads —
  // there's no page 2 to request. Every entry the feed returns is rendered
  // below; nothing in this file (or in scripts/fetch-main-feed.mjs) trims
  // that list further. Showing the full upload history would need a
  // different data source (YouTube Data API v3 with paginated
  // playlistItems.list), which is a bigger, separate change.
  const feed = await loadJSON("/assets/data/main-videos.json", { videos: [] });
  const videos = feed.videos || [];
  renderFeatured(videos[0]);
  mountFilters(videos);
  renderGrid(videos, "videos");
}

init();
