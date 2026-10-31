// YouTube page (/youtube/): the newest regular video as the hero, then every
// upload of the main channel split into Videos and Shorts. Shorts are uploads
// under two minutes, already classified as `isShort` by
// scripts/fetch-main-feed.mjs. Every video is a plain link to YouTube in the
// same tab: no player, no watch page, no modal.
//
// State that is linkable: the active tab lives in the URL hash (#shorts).
import { observeImpressions } from "/js/track.js";
import { initReveal } from "/js/reveal.js";
import { cleanText } from "/js/text.js";

const DATA_URL = "/assets/data/main-videos.json";
const CHANNEL_URL = "https://www.youtube.com/@ZevKev";
const PAGE_SIZE = { videos: 12, shorts: 24 };
// Literal class strings so the Tailwind scanner picks them up.
const GRID_CLASS = {
  videos: "yt-grid grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3",
  shorts: "yt-grid yt-grid--shorts grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6",
};
const TEARS = ["", " paper-b", " paper-c"];
const NOUN = { videos: ["Video", "Videos"], shorts: ["Short", "Shorts"] };

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  youtube:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  screen:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.2v5.6l4.6-2.8z" fill="currentColor"/></svg>',
};

const $ = (id) => document.getElementById(id);
const featureEl = $("yt-feature");
const statsEl = $("yt-stats");
const libraryEl = $("yt-library");
const panelEl = $("yt-panel");
const gridEl = $("yt-grid");
const moreBtn = $("yt-more");
const progressEl = $("yt-progress");
const statusEl = $("yt-status");
const tabsEl = $("yt-tabs");
const sortEl = $("yt-sort");
const tabs = [...tabsEl.querySelectorAll('[role="tab"]')];
const sortBtns = [...sortEl.querySelectorAll("[data-sort]")];

// Skeleton markup as shipped in the HTML, reused when "Nochmal versuchen"
// starts a fresh load after an error.
const initialFeatureHTML = featureEl.innerHTML;
const initialStatsHTML = statsEl.innerHTML;

const state = {
  loaded: false,
  failed: false,
  lists: { videos: [], shorts: [] },
  sorted: new Map(),
  hasViews: false,
  totalViews: 0,
  mode: modeFromHash() || "videos",
  sort: "new",
  shown: 0,
};

/* ---------- Formatting ---------- */

const numberDE = new Intl.NumberFormat("de-DE");
const decimalDE = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateShort = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const dateLong = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// 584 Aufrufe, 9.613 Aufrufe, 25,1 Tsd. Aufrufe, 410 Tsd. Aufrufe, 1,2 Mio. Aufrufe
function viewsText(n) {
  if (n === 1) return "1 Aufruf";
  if (n < 10_000) return `${numberDE.format(n)} Aufrufe`;
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${n < 100_000 ? decimalDE.format(Math.floor(k * 10) / 10) : numberDE.format(Math.floor(k))} Tsd. Aufrufe`;
  }
  return `${decimalDE.format(Math.floor(n / 100_000) / 10)} Mio. Aufrufe`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Heute, Gestern, vor 3 Tagen, vor 2 Wochen, then 12. Okt. 2025
function dateText(ms) {
  const d = new Date(ms);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days < 0) return dateShort.format(d);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "vor einer Woche" : `vor ${weeks} Wochen`;
  }
  return dateShort.format(d);
}

function durationText(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// Direct children of .yt-meta get a middle dot between them (page CSS).
function metaHTML(v) {
  const parts = [];
  if (v.views != null) parts.push(`<span title="${numberDE.format(v.views)} ${v.views === 1 ? "Aufruf" : "Aufrufe"}">${viewsText(v.views)}</span>`);
  if (v.published != null) {
    const d = new Date(v.published);
    parts.push(`<time datetime="${d.toISOString()}" title="${dateLong.format(d)}">${dateText(v.published)}</time>`);
  }
  return parts.join("");
}

/* ---------- Data ---------- */

const ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

function toCount(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function fallbackThumb(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function normalize(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !ID_RE.test(raw.id)) return null;
  const published = Date.parse(raw.publishedAt);
  const duration = toCount(raw.durationSeconds);
  return {
    id: raw.id,
    title: cleanText(raw.title) || "Video",
    published: Number.isFinite(published) ? published : null,
    views: toCount(raw.views),
    duration: duration > 0 ? duration : null,
    isShort: raw.isShort === true,
    thumb: typeof raw.thumbnail === "string" && raw.thumbnail.startsWith("https://") ? raw.thumbnail : fallbackThumb(raw.id),
  };
}

function watchUrl(v) {
  return v.isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
}

function sortedList() {
  const key = `${state.mode}:${state.sort}`;
  if (!state.sorted.has(key)) {
    const base = state.lists[state.mode];
    const list = state.sort === "views" ? [...base].sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.published ?? 0) - (a.published ?? 0)) : base;
    state.sorted.set(key, list);
  }
  return state.sorted.get(key);
}

/* ---------- Markup ---------- */

function channelButton(extra = "") {
  return `<a class="btn btn-yt${extra}" href="${CHANNEL_URL}" data-track-click="youtube-channel">${ICON.youtube}Zum Kanal</a>`;
}

function noticeHTML({ icon, heading = "h3", title, text, actions = "" }) {
  return `
    <div class="paper paper-c mx-auto flex max-w-xl flex-col items-center px-6 pb-10 pt-9 text-center sm:px-10">
      <span class="grid size-14 place-items-center rounded-full bg-paper-accent text-ink [&>svg]:size-7">${icon}</span>
      <${heading} class="font-display mt-4 text-3xl">${title}</${heading}>
      <p class="mt-2 max-w-sm leading-relaxed text-ink-muted">${text}</p>
      ${actions ? `<div class="mt-6 flex flex-wrap justify-center gap-3">${actions}</div>` : ""}
    </div>`;
}

function cardHTML(v, index) {
  const meta = metaHTML(v);
  const duration = v.duration ? `<span class="video-duration">${durationText(v.duration)}</span>` : "";
  return `
    <li class="reveal">
      <a class="paper${TEARS[index % 3]} paper-lift video-card" href="${watchUrl(v)}" data-video-id="${v.id}" data-yt-new data-track-click="youtube-${v.isShort ? "short" : "video"}:${v.id}">
        <div class="video-thumb${v.isShort ? " video-thumb--short" : ""}">
          <img src="${esc(v.thumb)}" data-fallback="${fallbackThumb(v.id)}" data-min-width="121" alt="" width="480" height="360" loading="lazy" decoding="async">
          ${duration}
        </div>
        <div class="video-title" title="${esc(v.title)}">${esc(v.title)}</div>
        ${meta ? `<div class="video-meta yt-meta">${meta}</div>` : ""}
      </a>
    </li>`;
}

function skeletonHTML(mode) {
  const thumb = mode === "shorts" ? "aspect-[9/16]" : "aspect-video";
  const count = mode === "shorts" ? 12 : 6;
  return Array.from(
    { length: count },
    (_, i) => `<li class="paper${TEARS[i % 3]} video-card" aria-hidden="true"><div class="yt-skel ${thumb}"></div><div class="yt-skel h-4 w-11/12"></div><div class="yt-skel h-4 w-3/5"></div><div class="yt-skel h-3 w-2/5"></div></li>`
  ).join("");
}

/* ---------- Rendering ---------- */

function renderStats() {
  const items = [
    [state.lists.videos.length, NOUN.videos],
    [state.lists.shorts.length, NOUN.shorts],
  ].map(([n, noun]) => [numberDE.format(n), noun[n === 1 ? 0 : 1]]);
  if (state.hasViews) items.push([numberDE.format(state.totalViews), state.totalViews === 1 ? "Aufruf" : "Aufrufe"]);
  statsEl.innerHTML = items.map(([num, label]) => `<li><span class="yt-stat-num">${num}</span><span class="yt-stat-label">${label}</span></li>`).join("");
  statsEl.hidden = false;
}

function renderCounts() {
  for (const el of tabsEl.querySelectorAll("[data-count]")) {
    el.textContent = numberDE.format(state.lists[el.dataset.count].length);
  }
}

function renderFeature() {
  // Newest regular video; only if there is none, the newest Short.
  const v = state.lists.videos[0] || state.lists.shorts[0];
  const url = watchUrl(v);
  const meta = metaHTML(v);
  // maxresdefault is sharper but missing on some uploads; the image handlers
  // below fall back to the feed's own thumbnail (see data-min-width).
  const src = v.isShort ? v.thumb : `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`;
  featureEl.innerHTML = `
    <article class="paper paper-b yt-feature" data-video-id="${v.id}">
      <div class="tape"></div>
      <div class="tape left-auto right-8 rotate-[8deg]"></div>
      <a class="video-thumb yt-feature-thumb" href="${url}" tabindex="-1" aria-hidden="true" data-track-click="youtube-hero-thumb:${v.id}">
        <img src="${esc(src)}" data-fallback="${esc(v.thumb)}" data-min-width="121" alt="" width="1280" height="720" fetchpriority="high" decoding="async">
        <span class="yt-play">${ICON.play}</span>
      </a>
      <div class="yt-feature-body">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
          <span class="badge bg-yt text-white">${v.isShort ? "Neuestes Short" : "Neuestes Video"}</span>
          ${meta ? `<span class="yt-meta">${meta}</span>` : ""}
        </div>
        <h2 class="yt-feature-title mt-3"><a href="${url}" tabindex="-1" data-track-click="youtube-hero-title:${v.id}">${esc(v.title)}</a></h2>
        <a class="btn btn-yt mt-6" href="${url}" data-track-click="youtube-hero-play:${v.id}">${ICON.play}Auf YouTube ansehen</a>
      </div>
    </article>`;
  featureEl.removeAttribute("aria-busy");
  observeImpressions("[data-video-id]", (el) => el.dataset.videoId, featureEl);
}

function syncSort() {
  sortEl.hidden = !state.hasViews;
  if (!state.hasViews) state.sort = "new";
  for (const btn of sortBtns) btn.setAttribute("aria-pressed", String(btn.dataset.sort === state.sort));
}

function showGridSkeleton() {
  gridEl.className = GRID_CLASS[state.mode];
  gridEl.setAttribute("aria-busy", "true");
  gridEl.innerHTML = skeletonHTML(state.mode);
  moreBtn.hidden = true;
  progressEl.hidden = true;
}

function renderGrid() {
  const list = sortedList();
  gridEl.className = GRID_CLASS[state.mode];
  gridEl.removeAttribute("aria-busy");
  gridEl.innerHTML = "";
  state.shown = 0;
  if (!list.length) {
    const noun = NOUN[state.mode][1];
    gridEl.innerHTML = `<li class="col-span-full">${noticeHTML({
      icon: ICON.screen,
      title: `Noch keine ${noun}`,
      text: `Hier sind noch keine ${noun} gelandet. Schau bald wieder vorbei oder direkt auf dem Kanal.`,
      actions: channelButton(),
    })}</li>`;
    updateMore(list);
    return;
  }
  appendPage(list);
}

// Appends the next page of cards and returns the first new card link.
function appendPage(list) {
  const start = state.shown;
  const slice = list.slice(start, start + PAGE_SIZE[state.mode]);
  gridEl.insertAdjacentHTML("beforeend", slice.map((v, i) => cardHTML(v, start + i)).join(""));
  state.shown = start + slice.length;
  // Only the cards added just now, so earlier ones never report twice.
  observeImpressions("[data-yt-new]", (el) => el.dataset.videoId, gridEl);
  for (const el of gridEl.querySelectorAll("[data-yt-new]")) el.removeAttribute("data-yt-new");
  initReveal(gridEl);
  updateMore(list);
  return gridEl.children[start]?.querySelector("a") || null;
}

function updateMore(list) {
  const left = list.length - state.shown;
  moreBtn.hidden = left <= 0;
  progressEl.hidden = left <= 0;
  progressEl.textContent = `${numberDE.format(state.shown)} von ${numberDE.format(list.length)} ${NOUN[state.mode][1]}`;
}

function showError() {
  featureEl.removeAttribute("aria-busy");
  featureEl.innerHTML = noticeHTML({
    icon: ICON.alert,
    heading: "h2",
    title: "Gerade hakt es",
    text: "Die Videoliste konnte nicht geladen werden. Versuch es gleich nochmal oder schau direkt auf YouTube vorbei.",
    actions: `<button type="button" class="btn btn-accent" data-yt-retry>${ICON.refresh}Nochmal versuchen</button>${channelButton()}`,
  });
  statsEl.hidden = true;
  libraryEl.hidden = true;
}

function showEmptyChannel() {
  featureEl.removeAttribute("aria-busy");
  featureEl.innerHTML = noticeHTML({
    icon: ICON.screen,
    heading: "h2",
    title: "Noch keine Videos",
    text: "Hier ist gerade noch nichts zu sehen. Auf dem Kanal findest du alles Neue zuerst.",
    actions: channelButton(),
  });
  statsEl.hidden = true;
  libraryEl.hidden = true;
}

/* ---------- Tabs, sort, hash ---------- */

function modeFromHash() {
  const hash = location.hash.toLowerCase();
  return hash === "#shorts" ? "shorts" : hash === "#videos" ? "videos" : null;
}

// Shorts get #shorts, Videos the clean URL. Other hashes (like the skip
// link's #main) are only replaced when the user actually switches tabs.
function syncHash() {
  const current = modeFromHash();
  const base = `${location.pathname}${location.search}`;
  if (state.mode === "shorts" && current !== "shorts") history.replaceState(history.state, "", `${base}#shorts`);
  else if (state.mode === "videos" && current === "shorts") history.replaceState(history.state, "", base);
}

function setMode(mode, { syncUrl = true, focusTab = false } = {}) {
  state.mode = mode;
  for (const tab of tabs) {
    const active = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focusTab) tab.focus();
  }
  panelEl.setAttribute("aria-labelledby", `yt-tab-${mode}`);
  if (syncUrl) syncHash();
  if (state.loaded) renderGrid();
  else if (!state.failed) showGridSkeleton();
}

function scrollToLibrary() {
  libraryEl.scrollIntoView({ block: "start" });
}

tabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (tab && tab.dataset.mode !== state.mode) setMode(tab.dataset.mode);
});

// Arrow keys move between the two tabs (WAI-ARIA tabs pattern).
tabsEl.addEventListener("keydown", (event) => {
  const index = tabs.indexOf(document.activeElement);
  if (index === -1) return;
  let next = null;
  if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
  else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
  else if (event.key === "Home") next = tabs[0];
  else if (event.key === "End") next = tabs[tabs.length - 1];
  if (!next) return;
  event.preventDefault();
  if (next.dataset.mode !== state.mode) setMode(next.dataset.mode, { focusTab: true });
  else next.focus();
});

sortEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-sort]");
  if (!btn || btn.dataset.sort === state.sort) return;
  state.sort = btn.dataset.sort;
  syncSort();
  if (state.loaded) renderGrid();
});

moreBtn.addEventListener("click", () => {
  const list = sortedList();
  const before = state.shown;
  const firstNew = appendPage(list);
  const added = state.shown - before;
  statusEl.textContent = `${added} weitere ${NOUN[state.mode][added === 1 ? 0 : 1]} geladen, ${state.shown} von ${list.length}.`;
  // Keyboard users continue at the first new card instead of losing focus
  // when the button disappears after the last page.
  firstNew?.focus({ preventScroll: true });
});

window.addEventListener("hashchange", () => {
  const mode = modeFromHash();
  if (!mode) return;
  if (mode !== state.mode) setMode(mode, { syncUrl: false });
  scrollToLibrary();
});

featureEl.addEventListener("click", (event) => {
  if (!event.target.closest("[data-yt-retry]")) return;
  featureEl.innerHTML = initialFeatureHTML;
  featureEl.setAttribute("aria-busy", "true");
  featureEl.focus({ preventScroll: true }); // the clicked button is gone now
  statsEl.innerHTML = initialStatsHTML;
  statsEl.hidden = false;
  libraryEl.hidden = false;
  state.failed = false;
  showGridSkeleton();
  load();
});

/* ---------- Thumbnails ---------- */

// Missing thumbnails: YouTube answers either with an error or with a tiny
// 120px grey placeholder. Swap to the fallback once, then show an empty frame.
function useFallback(img) {
  const fallback = img.dataset.fallback;
  delete img.dataset.fallback;
  if (fallback && img.getAttribute("src") !== fallback) {
    img.src = fallback; // still size-checked on load, see onThumbLoad
  } else {
    delete img.dataset.minWidth;
    img.closest(".video-thumb")?.classList.add("yt-thumb-broken");
  }
}
function onThumbLoad(event) {
  const img = event.target;
  if (img instanceof HTMLImageElement && img.dataset.minWidth && img.naturalWidth < Number(img.dataset.minWidth)) useFallback(img);
}
function onThumbError(event) {
  const img = event.target;
  if (img instanceof HTMLImageElement) useFallback(img);
}
for (const root of [featureEl, gridEl]) {
  root.addEventListener("load", onThumbLoad, true);
  root.addEventListener("error", onThumbError, true);
}

/* ---------- Boot ---------- */

let scrolledForHash = false;

async function load() {
  let all;
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = Array.isArray(data?.videos) ? data.videos : Array.isArray(data) ? data : null;
    if (!raw) throw new Error("unexpected data format");
    const seen = new Set();
    all = raw
      .map(normalize)
      .filter((v) => v && !seen.has(v.id) && seen.add(v.id))
      .sort((a, b) => (b.published ?? 0) - (a.published ?? 0));
  } catch (err) {
    console.warn("[youtube] Could not load the video list:", err);
    state.failed = true;
    showError();
    return;
  }

  state.lists = { videos: all.filter((v) => !v.isShort), shorts: all.filter((v) => v.isShort) };
  state.sorted.clear();
  const views = all.map((v) => v.views).filter((n) => n != null);
  state.hasViews = new Set(views).size > 1;
  state.totalViews = views.reduce((sum, n) => sum + n, 0);
  state.loaded = true;

  if (!all.length) {
    showEmptyChannel();
    return;
  }

  renderStats();
  renderCounts();
  renderFeature();
  syncSort();
  renderGrid();

  // Arriving via /youtube/#shorts: jump to the library once it exists.
  if (!scrolledForHash && modeFromHash() && window.scrollY < 40) scrollToLibrary();
  scrolledForHash = true;
}

setMode(state.mode, { syncUrl: false });
load();
