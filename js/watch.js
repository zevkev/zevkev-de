// Single-video page for both YouTube videos (/video/<id>/) and Twitch VODs
// (/vod/<id>/) -- same layout for both (player, meta, comments below), the
// only per-type difference is which JSON file the item comes from and an
// extra "Chat-Replay auf Twitch ansehen" link on VODs (Twitch's embed API
// explicitly does not support VOD chat replay -- confirmed against their
// own docs -- so linking out to Twitch's own player, which does show it
// natively, is the honest option rather than faking a broken embed).
import { mountComments, unmountComments } from "./comments.js";
import { track } from "./track.js";
import { getWatchlistIds, toggleWatchlistId, getProgress, saveProgress } from "./user-data.js";

const TWITCH_CHANNEL = "zevkev_";
// A video counts as "watched" once past this fraction of its duration --
// used for the Watchlist page's Weiterschauen/Angesehen grouping. Not 100%:
// most people don't sit through outros/credits, and requiring the exact end
// would mean a video someone clearly finished never gets marked watched.
const WATCHED_THRESHOLD = 0.9;

function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
}
function calendarIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>`;
}
function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function clockIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
function formatTwitchDuration(raw) {
  if (!raw) return "";
  const m = String(raw).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return "";
  const h = Number(m[1] || 0);
  const mi = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  if (!h && !mi && !s) return "";
  const mm = String(mi).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mi}:${ss}`;
}

function resolveFromLocation() {
  const params = new URLSearchParams(location.search);
  if (params.get("id")) {
    return { id: params.get("id"), type: params.get("type") === "vod" ? "vod" : "video" };
  }
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && (parts[0] === "video" || parts[0] === "vod")) {
    return { id: decodeURIComponent(parts[1]), type: parts[0] === "vod" ? "vod" : "video" };
  }
  return null;
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

let ytPlayerAPIPromise = null;
function ensureYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytPlayerAPIPromise) return ytPlayerAPIPromise;
  ytPlayerAPIPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytPlayerAPIPromise;
}
let twitchSDKPromise = null;
function ensureTwitchSDK() {
  if (window.Twitch && window.Twitch.Player) return Promise.resolve(window.Twitch);
  if (twitchSDKPromise) return twitchSDKPromise;
  twitchSDKPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://player.twitch.tv/js/embed/v1.js";
    tag.onload = () => resolve(window.Twitch);
    document.head.appendChild(tag);
  });
  return twitchSDKPromise;
}
function parentHosts() {
  return [...new Set([location.hostname, "zevkev.de", "www.zevkev.de", "localhost", "127.0.0.1"])];
}

const HEARTBEAT_MS = 30000;
function createWatchTimeTracker(path) {
  let intervalId = null;
  let segmentStart = null;
  function flush() {
    if (segmentStart == null) return;
    const elapsed = (Date.now() - segmentStart) / 1000;
    segmentStart = Date.now();
    if (elapsed > 0.5) track("watch_time", path, elapsed);
  }
  function start() {
    if (intervalId != null) return;
    segmentStart = Date.now();
    intervalId = setInterval(flush, HEARTBEAT_MS);
  }
  function stop() {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    flush();
    segmentStart = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
  return { start, stop };
}

function renderNotFound() {
  const page = document.getElementById("watch-page");
  if (page) {
    page.innerHTML = `<div class="empty-state"><h2>Video nicht gefunden</h2><p>Dieses Video gibt es nicht (mehr) — vielleicht wurde es entfernt oder der Link stimmt nicht mehr.</p><a href="/youtube/" class="p-btn rip btn-accent">Zu den Videos</a></div>`;
  }
  // Otherwise left as an empty .rip card with nothing in it -- mountComments
  // never runs for a not-found video, so there's no discussion to show.
  document.getElementById("comments-root")?.remove();
}

async function renderWatchlistButton(id) {
  const btn = document.getElementById("watch-watchlist-btn");
  if (!btn) return;
  const paint = (saved) => {
    btn.classList.toggle("is-saved", saved);
    btn.innerHTML = `${starIcon(saved)} ${saved ? "Auf der Watchlist" : "Zur Watchlist"}`;
  };
  paint((await getWatchlistIds()).has(id));
  btn.addEventListener("click", async () => {
    const updated = await toggleWatchlistId(id);
    paint(updated.has(id));
  });
}

function renderMeta(item, type, id) {
  const meta = document.getElementById("watch-meta");
  if (!meta) return;

  const stats = [];
  if (type === "video") {
    stats.push(`<span class="watch-stat">${calendarIcon()}${formatDate(item.publishedAt)}</span>`);
    if (item.views != null) stats.push(`<span class="watch-stat">${eyeIcon()}${formatViews(item.views)} Aufrufe</span>`);
  } else {
    stats.push(`<span class="watch-stat">${calendarIcon()}${formatDate(item.publishedAt)}</span>`);
    const dur = formatTwitchDuration(item.duration);
    if (dur) stats.push(`<span class="watch-stat">${clockIcon()}${dur}</span>`);
    if (item.viewCount != null) stats.push(`<span class="watch-stat">${eyeIcon()}${formatViews(item.viewCount)} Aufrufe</span>`);
  }

  meta.innerHTML = `
    <h1 class="watch-title">${escapeHTML(item.title)}</h1>
    <div class="watch-stats">${stats.join("")}</div>
    <div class="watch-actions">
      <button type="button" class="p-btn rip watchlist-toggle-lg" id="watch-watchlist-btn"></button>
      ${type === "vod" ? `<a class="p-btn rip" href="${item.url}" target="_blank" rel="noopener">Chat-Replay auf Twitch ansehen</a>` : `<a class="p-btn rip" href="${item.url}" target="_blank" rel="noopener">Auf YouTube ansehen</a>`}
    </div>`;
  renderWatchlistButton(id);
}

// Saved on pause/ended/page-hide only (not on a timer) to keep Firestore
// writes minimal -- see js/user-data.js's saveProgress. `getDuration()` is
// asked fresh each time rather than cached once, since neither player API
// reports it reliably before playback has actually started buffering.
function makeProgressSaver(progressKey, getCurrentTime, getDuration) {
  return (isEnded) => {
    const position = getCurrentTime();
    const duration = getDuration();
    if (!Number.isFinite(position) || position < 3) return; // barely started, not worth recording
    const watched = isEnded || (Number.isFinite(duration) && duration > 0 && position / duration >= WATCHED_THRESHOLD);
    saveProgress(progressKey, position, watched);
  };
}

function renderPlayer(item, type) {
  const wrap = document.getElementById("watch-player");
  if (!wrap) return;
  const progressKey = `${type}:${item.id}`;

  if (type === "video") {
    wrap.innerHTML = `
      <div class="player-wrap player-wrap--youtube rip">
        <iframe id="watch-yt-frame" src="https://www.youtube.com/embed/${item.id}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${escapeHTML(item.title)}" allowfullscreen></iframe>
      </div>`;
    const tracker = createWatchTimeTracker(item.id);
    ensureYouTubeAPI().then(async (YT) => {
      const el = document.getElementById("watch-yt-frame");
      if (!el) return;
      const resume = await getProgress(progressKey);
      let seeked = false;
      const player = new YT.Player("watch-yt-frame", {
        events: {
          onReady: () => {
            if (resume && !resume.watched && resume.positionSeconds > 5 && !seeked) {
              seeked = true;
              player.seekTo(resume.positionSeconds, true);
            }
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) tracker.start();
            else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.BUFFERING) tracker.stop();
            if (event.data === YT.PlayerState.PAUSED) saveNow(false);
            if (event.data === YT.PlayerState.ENDED) saveNow(true);
          },
        },
      });
      const saveNow = makeProgressSaver(progressKey, () => player.getCurrentTime?.() ?? 0, () => player.getDuration?.() ?? 0);
      window.addEventListener("beforeunload", () => saveNow(false));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) saveNow(false);
      });
    });
    return;
  }

  wrap.innerHTML = `
    <div class="player-wrap player-wrap--twitch rip">
      <div id="watch-twitch-target" style="width:100%;height:100%;"></div>
    </div>`;
  const tracker = createWatchTimeTracker(item.id);
  ensureTwitchSDK().then(async (Twitch) => {
    const el = document.getElementById("watch-twitch-target");
    if (!el) return;
    const resume = await getProgress(progressKey);
    const player = new Twitch.Player("watch-twitch-target", {
      video: item.id,
      parent: parentHosts(),
      width: "100%",
      height: "100%",
    });
    const saveNow = makeProgressSaver(progressKey, () => player.getCurrentTime?.() ?? 0, () => player.getDuration?.() ?? 0);
    let seeked = false;
    player.addEventListener(Twitch.Player.READY, () => {
      if (resume && !resume.watched && resume.positionSeconds > 5 && !seeked) {
        seeked = true;
        player.seek(resume.positionSeconds);
      }
    });
    player.addEventListener(Twitch.Player.PLAY, () => tracker.start());
    player.addEventListener(Twitch.Player.PAUSE, () => {
      tracker.stop();
      saveNow(false);
    });
    player.addEventListener(Twitch.Player.ENDED, () => {
      tracker.stop();
      saveNow(true);
    });
    window.addEventListener("beforeunload", () => saveNow(false));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveNow(false);
    });
  });
}

function updateMetaTags(item) {
  document.title = `${item.title} | ZevKev`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", item.title);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", item.title);
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && item.thumbnail) ogImage.setAttribute("content", item.thumbnail);
}

async function init() {
  const resolved = resolveFromLocation();
  if (!resolved) {
    renderNotFound();
    return;
  }
  const { id, type } = resolved;

  const feed = type === "video" ? await loadJSON("/assets/data/main-videos.json", { videos: [] }) : await loadJSON("/assets/data/twitch-vods.json", { videos: [] });
  const item = (feed.videos || []).find((v) => v.id === id);
  if (!item) {
    renderNotFound();
    return;
  }

  updateMetaTags(item);
  renderPlayer(item, type);
  renderMeta(item, type, id);
  mountComments(`${type}:${id}`);
}

window.addEventListener("beforeunload", unmountComments);
init();
