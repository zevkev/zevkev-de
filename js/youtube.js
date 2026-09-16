const WATCHLIST_KEY = "zevkev-watchlist";

// How many cards the grid shows before a "load more" click reveals the next
// batch. Needed now that main-videos.json can hold a long-running channel's
// entire upload history (hundreds of videos, via scripts/fetch-main-feed.mjs
// and the YouTube Data API) instead of the old RSS feed's ~15-video cap —
// rendering all of them into the DOM at once on first paint doesn't scale
// the same way. Reset to PAGE_SIZE on every Videos/Shorts tab switch
// (mountFilters below) and bumped by PAGE_SIZE on every "load more" click.
const PAGE_SIZE = 24;
let visibleCount = PAGE_SIZE;

const featuredEl = document.getElementById("yt-featured");
const gridEl = document.getElementById("yt-grid");
const filterBarEl = document.getElementById("yt-filter-bar");
const loadMoreEl = document.getElementById("yt-load-more");

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
function chevronDownIcon(size = 14) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
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
    renderLoadMore(videos, mode, 0, 0);
    return;
  }
  const shown = list.slice(0, visibleCount);
  const watchlist = getWatchlist();
  gridEl.innerHTML = shown.map((v) => cardHTML(v, watchlist, mode === "shorts")).join("");

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
      const video = shown.find((v) => v.id === card.dataset.videoId);
      if (video) openVideoModal(video);
    });
  });

  renderLoadMore(videos, mode, shown.length, list.length);
}

// Reveals the next PAGE_SIZE cards on click instead of rendering the whole
// (potentially hundreds-long) list at once. Re-renders via renderGrid rather
// than only appending new cards, so this stays in sync with the exact same
// slicing/empty-state logic above instead of duplicating it.
function renderLoadMore(videos, mode, shownCount, totalCount) {
  if (!loadMoreEl) return;
  if (shownCount >= totalCount) {
    loadMoreEl.innerHTML = "";
    return;
  }
  const label = mode === "shorts" ? "Weitere Shorts laden" : "Weitere Videos laden";
  loadMoreEl.innerHTML = `<button type="button" class="filter-pill rip yt-load-more-btn">${chevronDownIcon()}${label} &middot; noch ${totalCount - shownCount}</button>`;
  loadMoreEl.querySelector(".yt-load-more-btn").addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderGrid(videos, mode);
    loadMoreEl.querySelector(".yt-load-more-btn")?.focus();
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
      visibleCount = PAGE_SIZE; // fresh first page for the newly selected tab
      renderGrid(videos, pill.dataset.mode);
    });
  });
}

async function init() {
  // main-videos.json now comes from scripts/fetch-main-feed.mjs's YouTube
  // Data API v3 pass (paginated playlistItems.list against the uploads
  // playlist), not the old public RSS feed — so it holds the channel's full
  // upload history, not just the last ~15. Every entry is still rendered
  // here; renderGrid just reveals it PAGE_SIZE cards at a time (see
  // renderLoadMore above) instead of dumping the whole history into the DOM
  // on first paint.
  const feed = await loadJSON("/assets/data/main-videos.json", { videos: [] });
  const videos = feed.videos || [];
  renderFeatured(videos[0]);
  mountFilters(videos);
  renderGrid(videos, "videos");
}

init();
