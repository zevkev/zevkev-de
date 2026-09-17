const WATCHLIST_KEY = "zevkev-watchlist";

// How many cards the shelf shows before a "load more" click reveals the next
// batch. Needed now that main-videos.json can hold a long-running channel's
// entire upload history (hundreds of videos, via scripts/fetch-main-feed.mjs
// and the YouTube Data API) instead of the old RSS feed's ~15-video cap —
// rendering all of them into the DOM at once on first paint doesn't scale
// the same way. Reset to PAGE_SIZE on every Videos/Shorts tab switch
// (mountFilters below) and bumped by PAGE_SIZE on every "load more" click.
const PAGE_SIZE = 24;
let visibleCount = PAGE_SIZE;

// "Neueste" / "Meistgesehen" toggle for whichever tab (Videos or Shorts) is
// active. Reset to "new" on every tab switch, same as visibleCount, so a
// fresh tab always opens on its natural chronological order.
let sortMode = "new";

// Minimum items + real view-count spread before the sort toggle is worth
// showing at all -- same threshold js/vods.js uses for its Twitch-archive
// sort pills (see renderSortBar below).
const SORT_MIN = 4;

// The Videos tab's "Aus dem Archiv" discovery row (see renderSpotlight) is
// computed once per page load, not on every re-render -- otherwise it would
// re-roll on every "load more" click or sort change, which reads as buggy
// rather than as a stable discovery pick. Empty until computeSpotlight() runs
// in init(), and stays empty forever if the gate in computeSpotlight isn't
// met. An array now (not a single pick) -- see the gating rationale below
// .yt-spotlight-label in css/youtube.css: unlike the Twitch VOD archive,
// which vods.js gates at just 3 items because that list is permanently
// capped at 12 by its own fetch script, main-videos.json holds the channel's
// *entire* upload history with no such cap, so a whole horizontal row of
// picks (not one lonely card) is worth the screen space once there's a real
// pool to discover from.
let spotlightVideos = [];
const SPOTLIGHT_MIN_TOTAL = 8;
const SPOTLIGHT_MIN_POOL = 5;
const SPOTLIGHT_MAX_PICKS = 10;

const heroMediaEl = document.getElementById("yt-hero-media");
const heroContentEl = document.getElementById("yt-hero-content");
const gridEl = document.getElementById("yt-grid");
const filterBarEl = document.getElementById("yt-filter-bar");
const spotlightEl = document.getElementById("yt-spotlight");
const sortBarEl = document.getElementById("yt-sort-bar");
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
function sortIcon(size = 13) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4"/></svg>`;
}
function chevronLeftIcon(size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`;
}
function chevronRightIcon(size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
}
function calendarIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>`;
}
function youtubeGlyph() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
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
   A custom-styled, on-brand launcher (play-button card, or the full-bleed
   hero below) opens this instead of sending people straight to youtube.com.
   Actual playback is still a real YouTube iframe embed under the hood (per
   YouTube's terms), just presented in the site's own torn-paper chrome.
   Reuses .cart-backdrop / .qv-panel / .qv-close (already loaded via
   style.css + shop.css) for the floating-panel shell, matching the shop's
   quick-view exactly. */
let modalLastFocused = null;

function videoModalHTML(video) {
  const meta = [
    video.publishedAt ? formatDate(video.publishedAt) : "",
    video.views != null ? `${formatViews(video.views)} Aufrufe` : "",
  ].filter(Boolean).join(" &middot; ");
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
    ${meta ? `<div class="yt-modal-meta">${meta}</div>` : ""}
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

/* ---------- Full-bleed hero ----------
   Gronkh.tv-style structural reference: the latest upload fills the page's
   full width/height as a background image right from y=0, with the site nav
   floating on top of it (see initHeroScrollObserver below) instead of a
   bounded card sitting underneath a solid nav bar. Click the image or the
   "Video ansehen" button to open the same on-brand modal every card uses --
   this stays a thumbnail + our own overlay rather than an autoplaying
   full-viewport iframe, so it's stylable (gradient scrim, overlaid title)
   and light to load. */
function renderFeatured(video) {
  if (!heroMediaEl || !heroContentEl) return;

  if (!video) {
    heroMediaEl.innerHTML = "";
    heroContentEl.innerHTML = `
      <div class="yt-hero-empty">
        ${emptyIcon()}
        <h2>Noch keine Videos geladen</h2>
        <p>Schau bald wieder vorbei.</p>
        <a class="yt-empty-cta" href="https://www.youtube.com/@ZevKev" target="_blank" rel="noopener">Zum YouTube-Kanal</a>
      </div>`;
    return;
  }

  heroMediaEl.innerHTML = `<img src="${video.thumbnail}" alt="">`;
  heroMediaEl.querySelector("img")?.addEventListener("click", () => openVideoModal(video));

  const stats = [
    video.publishedAt ? `<span class="stat">${calendarIcon()}${formatDate(video.publishedAt)}</span>` : "",
    video.views != null ? `<span class="stat">${eyeIcon()}${formatViews(video.views)} Aufrufe</span>` : "",
  ].filter(Boolean).join("");

  const watchlist = getWatchlist();
  const saved = watchlist.has(video.id);

  heroContentEl.innerHTML = `
    <div class="yt-hero-badge">${video.isShort ? boltIcon(13) : playIcon(13)}${video.isShort ? "Neuestes Short" : "Neuestes Video"}</div>
    <div class="yt-hero-title">${video.title}</div>
    ${stats ? `<div class="yt-hero-stats">${stats}</div>` : ""}
    <div class="yt-hero-actions">
      <button type="button" class="yt-hero-play-btn" id="yt-hero-play">${playIcon(16)}Video ansehen</button>
      <a class="btn-youtube" href="https://www.youtube.com/@ZevKev?sub_confirmation=1" target="_blank" rel="noopener">${youtubeGlyph()}Abonnieren</a>
      <button type="button" class="watchlist-toggle yt-hero-watch${saved ? " is-saved" : ""}" data-watch-id="${video.id}" aria-label="Zur Watchlist">${starIcon(saved)}</button>
    </div>`;

  heroContentEl.querySelector("#yt-hero-play")?.addEventListener("click", () => openVideoModal(video));
  const watchBtn = heroContentEl.querySelector(".yt-hero-watch");
  watchBtn?.addEventListener("click", () => {
    const updated = toggleWatchlist(video.id);
    const isSaved = updated.has(video.id);
    watchBtn.classList.toggle("is-saved", isSaved);
    watchBtn.innerHTML = starIcon(isSaved);
  });
}

// The nav (mounted by js/layout.js into #site-header, untouched here) floats
// as a transparent bar directly over the hero -- see the body.yt-page rules
// in css/youtube.css -- and only gains its normal solid paper background
// once the hero has actually scrolled past it. #yt-hero-sentinel sits right
// at that boundary; watching it (rather than a raw scroll-position number)
// stays correct even if the hero's own height changes across breakpoints.
function initHeroScrollObserver() {
  const sentinel = document.getElementById("yt-hero-sentinel");
  if (!sentinel) return;
  if (!("IntersectionObserver" in window)) {
    document.body.classList.add("yt-scrolled");
    return;
  }
  const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-h"), 10) || 72;
  const io = new IntersectionObserver(
    ([entry]) => document.body.classList.toggle("yt-scrolled", !entry.isIntersecting),
    { rootMargin: `-${headerH}px 0px 0px 0px`, threshold: 0 }
  );
  io.observe(sentinel);
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

// Shared by renderGrid and renderSpotlight so the watchlist-star and
// open-modal wiring (and the "let ctrl/cmd/shift/alt/middle click still open
// a real new tab" carve-out) lives in one place instead of two copies.
function attachCardHandlers(container, clickableVideos) {
  container.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const updated = toggleWatchlist(btn.dataset.watchId);
      const isSaved = updated.has(btn.dataset.watchId);
      btn.classList.toggle("is-saved", isSaved);
      btn.innerHTML = starIcon(isSaved);
    });
  });

  container.querySelectorAll(".vod-card").forEach((card) => {
    card.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      const video = clickableVideos.find((v) => v.id === card.dataset.videoId);
      if (video) openVideoModal(video);
    });
  });
}

// Wires the prev/next chevrons on a horizontally scrolling row (.yt-shelf
// inside .yt-shelf-wrap) -- one "page" (~85% of the visible width) per
// click, plus hiding whichever end has nothing left to scroll to instead of
// leaving a dead-looking control sitting there. Called once for the static
// main shelf in init(), and again every time renderSpotlight rebuilds its
// own shelf (its wrap element is freshly created each time, so it needs its
// own wiring pass). Returns a refresh() callers can re-invoke after they
// change how many cards are in the row (see renderGrid's use of
// mainShelfRefresh below) -- re-wiring the click handlers isn't needed since
// the track/buttons themselves don't get replaced, only their contents.
function initShelf(wrapEl) {
  const track = wrapEl?.querySelector(".yt-shelf");
  const prev = wrapEl?.querySelector(".yt-shelf-nav--prev");
  const next = wrapEl?.querySelector(".yt-shelf-nav--next");
  if (!track || !prev || !next) return null;

  prev.addEventListener("click", () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left: track.clientWidth * 0.85, behavior: "smooth" }));

  const updateNav = () => {
    const canScroll = track.scrollWidth > track.clientWidth + 4;
    prev.classList.toggle("is-hidden", !canScroll || track.scrollLeft <= 10);
    next.classList.toggle("is-hidden", !canScroll || track.scrollLeft >= track.scrollWidth - track.clientWidth - 10);
  };
  track.addEventListener("scroll", updateNav, { passive: true });
  window.addEventListener("resize", updateNav);
  // Images/cards can still be loading right after this runs, which changes
  // scrollWidth -- one rAF pass plus a short delayed re-check covers that
  // without needing a full ResizeObserver.
  requestAnimationFrame(updateNav);
  setTimeout(updateNav, 300);
  return updateNav;
}

// Set once in init() (the main shelf's wrap/buttons are static HTML, so
// initShelf only ever needs to run once for it) and re-invoked from
// renderGrid below whenever the card count in #yt-grid changes -- load-more
// clicks and tab/sort switches can flip whether there's anything left to
// scroll to.
let mainShelfRefresh = null;

// True once at least two videos in the list have a different view count --
// guards the sort toggle below from offering to "sort by views" when every
// card would end up in the exact same order anyway.
function hasViewVariance(list) {
  const vals = new Set(list.map((v) => v.views ?? 0));
  return vals.size > 1;
}

function orderList(list, sort) {
  if (sort !== "views") return list;
  return [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

// Computed once from the full feed right after it loads (see init()), not on
// every render -- picking a fresh random sample on every "load more" click
// or sort change would make the row look like it's glitching rather than
// showing a stable discovery pick.
function computeSpotlight(videos) {
  const featuredId = videos[0]?.id;
  const nonShorts = videos.filter((v) => !v.isShort);
  const pool = nonShorts.filter((v) => v.id !== featuredId);
  if (nonShorts.length < SPOTLIGHT_MIN_TOTAL || pool.length < SPOTLIGHT_MIN_POOL) {
    spotlightVideos = [];
    return;
  }
  // Fisher-Yates shuffle of a copy of the pool, then take the first
  // SPOTLIGHT_MAX_PICKS -- an unbiased random sample rather than a single
  // pick, so "Aus dem Archiv" reads as its own horizontal discovery row.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  spotlightVideos = shuffled.slice(0, SPOTLIGHT_MAX_PICKS);
}

// Only ever shown on the Videos tab (see the comment on computeSpotlight) --
// Shorts already get their own dense shelf with nothing to "discover" beyond
// scrolling it. Reuses the same cardHTML/.yt-shelf card language as the main
// row below (not a separate wide spotlight-card layout) per the gronkh.tv
// structural reference: a second horizontal discovery row, not a one-off.
function renderSpotlight(mode) {
  if (!spotlightEl) return;
  if (mode !== "videos" || !spotlightVideos.length) {
    spotlightEl.innerHTML = "";
    return;
  }
  const watchlist = getWatchlist();
  spotlightEl.innerHTML = `
    <div class="yt-spotlight-label">Aus dem Archiv</div>
    <div class="yt-shelf-wrap">
      <button type="button" class="yt-shelf-nav yt-shelf-nav--prev is-hidden" aria-label="Zurück scrollen">${chevronLeftIcon()}</button>
      <div class="yt-shelf" id="yt-spotlight-shelf">${spotlightVideos.map((v) => cardHTML(v, watchlist, false)).join("")}</div>
      <button type="button" class="yt-shelf-nav yt-shelf-nav--next" aria-label="Weiter scrollen">${chevronRightIcon()}</button>
    </div>`;
  attachCardHandlers(spotlightEl, spotlightVideos);
  initShelf(spotlightEl.querySelector(".yt-shelf-wrap"));
}

// "Neueste" / "Meistgesehen" toggle for the currently active tab's own list.
// A compact segmented control rather than a second row of big pills
// identical to the Videos/Shorts filter above -- it's a secondary, lighter-
// weight control, not another primary navigation choice. Gated at SORT_MIN
// items with real view-count spread (see its declaration above) -- both
// thresholds real main-videos.json data already clears today for the Videos
// tab (4 items, all with different view counts) and easily clears for
// Shorts (11 items).
function renderSortBar(videos, list, mode) {
  if (!sortBarEl) return;
  if (list.length < SORT_MIN || !hasViewVariance(list)) {
    sortBarEl.innerHTML = "";
    return;
  }
  sortBarEl.innerHTML = `
    <span class="yt-sort-label">${sortIcon()}Sortierung</span>
    <div class="yt-sort-toggle" role="group" aria-label="Sortierung">
      <button type="button" class="yt-sort-btn${sortMode === "new" ? " is-active" : ""}" data-sort="new">Neueste</button>
      <button type="button" class="yt-sort-btn${sortMode === "views" ? " is-active" : ""}" data-sort="views">Meistgesehen</button>
    </div>`;
  sortBarEl.querySelectorAll(".yt-sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.sort === sortMode) return;
      sortMode = btn.dataset.sort;
      visibleCount = PAGE_SIZE; // fresh first page under the new order
      renderGrid(videos, mode);
    });
  });
}

function renderGrid(videos, mode) {
  if (!gridEl) return;
  const list = mode === "shorts" ? videos.filter((v) => v.isShort) : videos.filter((v) => !v.isShort);
  gridEl.classList.toggle("yt-grid--shorts", mode === "shorts");

  renderSpotlight(mode);
  renderSortBar(videos, list, mode);

  if (!list.length) {
    gridEl.innerHTML = `<div class="empty-state">${emptyIcon()}<h2>${mode === "shorts" ? "Noch keine Shorts" : "Noch keine Videos"}</h2><p>Schau bald wieder vorbei.</p><a class="yt-empty-cta" href="https://www.youtube.com/@ZevKev" target="_blank" rel="noopener">Zum YouTube-Kanal</a></div>`;
    renderLoadMore(videos, mode, 0, 0);
    mainShelfRefresh?.();
    return;
  }
  const ordered = orderList(list, sortMode);
  const shown = ordered.slice(0, visibleCount);
  const watchlist = getWatchlist();
  gridEl.innerHTML = shown.map((v) => cardHTML(v, watchlist, mode === "shorts")).join("");
  attachCardHandlers(gridEl, shown);

  renderLoadMore(videos, mode, shown.length, ordered.length);
  // Card count (and with it, whether the shelf even needs to scroll) just
  // changed -- re-check the nav chevrons once the new cards have laid out.
  requestAnimationFrame(() => mainShelfRefresh?.());
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
      sortMode = "new"; // and its own natural chronological order
      renderGrid(videos, pill.dataset.mode);
    });
  });
}

async function init() {
  // The hero's transparent-over-image nav treatment and the main shelf's
  // prev/next chevrons don't depend on the feed, so they're wired up
  // immediately rather than waiting on the fetch below.
  initHeroScrollObserver();
  mainShelfRefresh = initShelf(document.getElementById("yt-grid-wrap"));

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
  computeSpotlight(videos);
  mountFilters(videos);
  renderGrid(videos, "videos");
}

init();
