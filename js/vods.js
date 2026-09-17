import { TWITCH_ENABLED } from "./config.js";
import { consumeRedirect, getToken, startLogin, logout, getCurrentUser, resolveBroadcasterId, sendChatMessage, onAuthChange } from "./twitch-auth.js";
import { observeImpressions, track } from "./track.js";
import { getWatchlistIds, toggleWatchlistId } from "./user-data.js";

const TWITCH_CHANNEL = "zevkev_";
// Loaded once in init() and kept in sync locally after that -- see the same
// pattern (and the reasoning for it) in js/youtube.js.
let watchlistCache = new Set();

const heroPlayer = document.getElementById("vod-hero-player");
const chatCol = document.getElementById("chat-col");
const vodGrid = document.getElementById("vod-grid");
const sectionHead = document.getElementById("vod-section-head");
const twitchSpotlightWrap = document.getElementById("twitch-spotlight-wrap");
const twitchSpotlightRow = document.getElementById("twitch-spotlight-row");
const twitchArchiveHead = document.getElementById("twitch-archive-head");
const twitchVodRow = document.getElementById("twitch-vod-row");

function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
}

// Small source-brand glyphs for the status badge, so "offline, showing a
// Twitch VOD" and "offline, showing the YouTube fallback" read apart at a
// glance instead of only through text. Same paths already used elsewhere on
// the site (Twitch login button, YouTube subscribe button).
function twitchIcon() {
  return `<svg class="status-badge-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`;
}
function youtubeIcon() {
  return `<svg class="status-badge-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
}

// Small stroke-style meta icons (views/duration/date/game) for the hero's
// stat row and the Twitch archive cards — same visual language as youtube.js's
// eye icon, redefined locally rather than imported, matching this codebase's
// existing convention of each page script owning its own small icon set
// instead of a shared module.
function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function clockIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
}
function calendarIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>`;
}
function gameIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M19 13h.01"/></svg>`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function parentParams() {
  const hosts = new Set([location.hostname, "zevkev.de", "www.zevkev.de", "localhost", "127.0.0.1"]);
  return [...hosts].map((h) => `parent=${encodeURIComponent(h)}`).join("&");
}

// Same host allow-list as parentParams() above, just shaped as a plain array
// -- Twitch's embed JS SDK takes `parent` as an array of hostnames on its
// constructor options object, not a URL query string. Kept as its own
// function (not derived from parentParams()) so touching the iframe-URL path
// used by the still-untouched chat embed can never accidentally affect the
// SDK path, or vice versa.
function parentHosts() {
  return [...new Set([location.hostname, "zevkev.de", "www.zevkev.de", "localhost", "127.0.0.1"])];
}

// ---------- Watch-time analytics ----------
// Both platforms' official JS player APIs (loaded lazily below, once per
// page, the first time a player actually needs them) expose real
// play/pause/ended events -- this turns those into periodic heartbeats while
// a video is actively playing, not just one call at the end, so a visitor
// closing the tab without a clean pause/unload event doesn't lose the
// segment. Each tracker resets its own elapsed-time counter right after
// sending a heartbeat so totals summed on the dashboard don't double count.
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
    if (intervalId != null) return; // already accumulating
    segmentStart = Date.now();
    intervalId = setInterval(flush, HEARTBEAT_MS);
  }

  function stop() {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    flush(); // final heartbeat for whatever accumulated since the last tick
    segmentStart = null;
  }

  function onVisibilityChange() {
    if (document.hidden) flush();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  function destroy() {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  return { start, stop, destroy };
}

// YouTube IFrame Player API: loaded lazily (no static <script> tag, so a page
// load that never shows a YouTube-sourced player doesn't pay for it). The
// API's own script calls a *global* window.onYouTubeIframeAPIReady callback
// once ready (this is the API's documented contract) -- wrapped in a promise
// here so callers can just await it. Chains onto any pre-existing callback
// rather than clobbering it.
let youtubeAPIPromise = null;
function ensureYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (youtubeAPIPromise) return youtubeAPIPromise;
  youtubeAPIPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return youtubeAPIPromise;
}

// Twitch's official embed JS SDK, loaded lazily the same way.
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

function onYTStateChange(YT, tracker) {
  return (event) => {
    if (event.data === YT.PlayerState.PLAYING) tracker.start();
    else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.BUFFERING) tracker.stop();
  };
}

function attachTwitchTracking(player, Twitch, tracker) {
  player.addEventListener(Twitch.Player.PLAY, () => tracker.start());
  player.addEventListener(Twitch.Player.PAUSE, () => tracker.stop());
  player.addEventListener(Twitch.Player.ENDED, () => tracker.stop());
}

function getWatchlist() {
  return watchlistCache;
}
async function toggleWatchlist(id) {
  watchlistCache = await toggleWatchlistId(id);
  return watchlistCache;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

// Twitch's publishedAt (like the YouTube feeds') carries real clock time, not
// just a date — gronkh.tv-style archive cards show both, so this pulls the
// same richer stamp wherever the source data actually supports it.
function formatDateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);
    return `${date} &middot; ${time} Uhr`;
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

// Twitch's Helix API returns VOD duration as a compact string like "3h24m10s"
// (hours/minutes omitted when zero), never as raw seconds — parsed here into
// the H:MM:SS long-form real streams need, or M:SS for anything under an hour.
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

// Elapsed time since a live stream's startedAt, ticked locally from data
// already fetched once at page load — no extra polling/network calls added.
function formatElapsedSince(iso) {
  if (!iso) return "";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "";
  const totalSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(totalSec / 3600);
  const mi = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(mi).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mi}:${ss}`;
}

// Fisher-Yates: used to pick a handful of "Aus dem Archiv" cards that don't
// repeat in the same order every reload (see renderTwitchArchive below).
function shuffledSample(list, n) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
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

// Shown the instant the page mounts, before the data fetches below resolve,
// so the layout is never a blank gap on the mat. Deliberately plain (no
// .rip) and sized to the final content's footprint, matching the shimmer
// convention already used for the shop grid (see js/catalog.js) — swapped
// out in full by the render* calls at the end of init() once data is in.
function renderSkeletons() {
  if (heroPlayer) {
    heroPlayer.innerHTML = `<div class="skeleton-card player-skeleton"></div>`;
  }
  if (chatCol && TWITCH_ENABLED) {
    chatCol.innerHTML = `<div class="skeleton-card chat-skeleton"></div>`;
  }
  if (twitchVodRow && TWITCH_ENABLED) {
    twitchVodRow.innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton-card"></div>`).join("");
  }
  if (vodGrid) {
    vodGrid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card"></div>`).join("");
  }
}

let liveTickerId = null;
// Hero player tracking state -- one active tracker/player instance at a
// time (only one of the three renderPlayer() branches ever runs), reset via
// resetHeroPlayer() at the top of every renderPlayer() call.
let heroWatchTracker = null;
let heroTwitchPlayer = null;
let heroYTPlayer = null;

function resetHeroPlayer() {
  if (liveTickerId) {
    clearInterval(liveTickerId);
    liveTickerId = null;
  }
  heroWatchTracker?.destroy();
  heroWatchTracker = null;
  // No documented Twitch.Player.destroy() -- the innerHTML swap that follows
  // this call already tears down its iframe; just drop the reference.
  heroTwitchPlayer = null;
  heroYTPlayer?.destroy?.();
  heroYTPlayer = null;
}

function startLiveElapsedTicker(startedAtIso) {
  if (liveTickerId) clearInterval(liveTickerId);
  liveTickerId = setInterval(() => {
    const el = document.getElementById("live-elapsed");
    if (!el) {
      clearInterval(liveTickerId);
      liveTickerId = null;
      return;
    }
    el.textContent = formatElapsedSince(startedAtIso);
  }, 30000);
}

// Priority for the hero: live on Twitch > latest Twitch VOD (archived
// broadcast) > latest YouTube video, only falling that far back if nothing
// has ever aired on Twitch yet. Untouched from the original logic — only the
// markup each branch renders got richer, and now lands in the full-bleed
// hero's #vod-hero-player instead of a boxed card below the page title.
function renderPlayer(status, latestTwitchVod, latestYoutubeVideo) {
  if (!heroPlayer) return;
  resetHeroPlayer();

  if (status.live) {
    heroPlayer.innerHTML = `
      <div class="player-wrap player-wrap--live rip">
        <div id="twitch-hero-target" style="width:100%;height:100%;"></div>
      </div>
      <div class="vod-hero-status">
        <span class="status-badge is-live"><span class="dot"></span> Live</span>
        <h1 class="vod-hero-title">${status.title || "Live auf Twitch"}</h1>
        <div class="player-stats">
          ${status.game ? `<span class="stat">${gameIcon()}${status.game}</span>` : ""}
          ${status.viewerCount != null ? `<span class="stat">${eyeIcon()}${formatViews(status.viewerCount)} Zuschauer</span>` : ""}
          ${status.startedAt ? `<span class="stat">${clockIcon()}seit <span id="live-elapsed">${formatElapsedSince(status.startedAt)}</span></span>` : ""}
        </div>
        <div class="vod-hero-actions">
          <a class="vod-hero-btn vod-hero-btn--primary" href="/live/">Jetzt zuschauen</a>
          <a class="vod-hero-btn vod-hero-btn--ghost" href="https://www.twitch.tv/${TWITCH_CHANNEL}/schedule" target="_blank" rel="noopener">Zeitplan</a>
        </div>
      </div>`;
    if (status.startedAt) startLiveElapsedTicker(status.startedAt);

    // Same visual result as the old plain iframe (the SDK injects its own
    // iframe as a child of #twitch-hero-target, still matched by the
    // existing `.player-wrap iframe { width:100%; height:100% }` rule since
    // it's a descendant selector) -- just constructed via the SDK so play/
    // pause/ended events are available for watch-time tracking. The target
    // div gets an explicit inline 100%/100% itself: it sits between
    // `.player-wrap` (which has a definite height from the full-bleed hero's
    // absolute positioning) and the SDK's iframe (which is `height:100%` via
    // CSS, not `position:absolute`) -- without an explicit height in between,
    // that percentage chain would resolve against "auto" and collapse.
    const tracker = createWatchTimeTracker(`live:${TWITCH_CHANNEL}`);
    heroWatchTracker = tracker;
    ensureTwitchSDK().then((Twitch) => {
      const el = document.getElementById("twitch-hero-target");
      if (!el || heroWatchTracker !== tracker) return; // hero re-rendered before the SDK finished loading
      heroTwitchPlayer = new Twitch.Player("twitch-hero-target", {
        channel: TWITCH_CHANNEL,
        parent: parentHosts(),
        muted: false,
        autoplay: true,
        width: "100%",
        height: "100%",
      });
      attachTwitchTracking(heroTwitchPlayer, Twitch, tracker);
    });
    return;
  }

  if (TWITCH_ENABLED && latestTwitchVod) {
    const dur = formatTwitchDuration(latestTwitchVod.duration);
    const views = latestTwitchVod.viewCount != null ? formatViews(latestTwitchVod.viewCount) : "";
    heroPlayer.innerHTML = `
      <div class="player-wrap player-wrap--twitch rip">
        <div id="twitch-hero-target" style="width:100%;height:100%;"></div>
      </div>
      <div class="vod-hero-status">
        <span class="status-badge is-offline">${twitchIcon()} Offline</span>
        <h1 class="vod-hero-title">${latestTwitchVod.title}</h1>
        <div class="player-stats">
          ${dur ? `<span class="stat">${clockIcon()}${dur}</span>` : ""}
          ${views ? `<span class="stat">${eyeIcon()}${views} Aufrufe</span>` : ""}
          <span class="stat">${calendarIcon()}${formatDateTime(latestTwitchVod.publishedAt)}</span>
        </div>
        <div class="vod-hero-actions">
          <a class="vod-hero-btn vod-hero-btn--primary" href="#twitch-vod-row">Weitere VODs</a>
          <a class="vod-hero-btn vod-hero-btn--ghost" href="https://www.twitch.tv/${TWITCH_CHANNEL}" target="_blank" rel="noopener">Auf Twitch folgen</a>
        </div>
      </div>`;

    const tracker = createWatchTimeTracker(latestTwitchVod.id);
    heroWatchTracker = tracker;
    ensureTwitchSDK().then((Twitch) => {
      const el = document.getElementById("twitch-hero-target");
      if (!el || heroWatchTracker !== tracker) return;
      heroTwitchPlayer = new Twitch.Player("twitch-hero-target", {
        video: latestTwitchVod.id,
        parent: parentHosts(),
        width: "100%",
        height: "100%",
      });
      attachTwitchTracking(heroTwitchPlayer, Twitch, tracker);
    });
    return;
  }

  if (latestYoutubeVideo) {
    const explain = TWITCH_ENABLED ? "Noch nichts auf Twitch archiviert. Hier das neueste Video vom VOD Kanal." : "";
    heroPlayer.innerHTML = `
      <div class="player-wrap player-wrap--youtube rip">
        <iframe id="vod-hero-yt-frame" src="https://www.youtube.com/embed/${latestYoutubeVideo.id}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${escapeHTML(latestYoutubeVideo.title)}" allowfullscreen></iframe>
      </div>
      <div class="vod-hero-status">
        ${TWITCH_ENABLED ? `<span class="status-badge is-offline">${youtubeIcon()} Offline</span>` : ""}
        <h1 class="vod-hero-title">${latestYoutubeVideo.title}</h1>
        ${explain ? `<p class="vod-hero-explain">${explain}</p>` : ""}
        <div class="player-stats"><span class="stat">${calendarIcon()}${formatDate(latestYoutubeVideo.publishedAt)}</span></div>
        <div class="vod-hero-actions">
          <a class="btn-youtube" href="${latestYoutubeVideo.url}" target="_blank" rel="noopener">${youtubeIcon()} Auf YouTube ansehen</a>
        </div>
      </div>`;

    // Same iframe, same src video -- just enablejsapi/origin added so the YT
    // IFrame API can attach to this already-in-DOM element (per its own
    // documented "existing iframe" mode) without rebuilding the URL. No
    // autoplay param before or after this change, so playback behavior is
    // identical to the original iframe.
    const tracker = createWatchTimeTracker(latestYoutubeVideo.id);
    heroWatchTracker = tracker;
    ensureYouTubeAPI().then((YT) => {
      const el = document.getElementById("vod-hero-yt-frame");
      if (!el || heroWatchTracker !== tracker) return;
      heroYTPlayer = new YT.Player("vod-hero-yt-frame", {
        events: { onStateChange: onYTStateChange(YT, tracker) },
      });
    });
    return;
  }

  heroPlayer.innerHTML = `
    <div class="player-wrap player-empty rip">
      <div class="empty-state">
        <h2>Noch keine Videos</h2>
        <p>Schau später nochmal vorbei.</p>
      </div>
    </div>`;
}

// Offline: the chat column stays fully empty and collapsed (not even a
// placeholder note) rather than taking up space beside the player -- the
// player itself is flex:1, so with the chat column gone it reclaims the
// full hero width. Only a real live stream gets the column back.
function renderChat(status) {
  if (!chatCol || !TWITCH_ENABLED) return;
  if (!status.live) {
    chatCol.innerHTML = "";
    chatCol.style.display = "none";
    return;
  }
  chatCol.style.display = "";
  chatCol.innerHTML = `
    <div class="chat-panel rip rip--b">
      <h2>Live Chat</h2>
      <div class="chat-frame-wrap">
        <iframe src="https://www.twitch.tv/embed/${TWITCH_CHANNEL}/chat?${parentParams()}&darkpopout"></iframe>
      </div>
      <div class="chat-login-row" id="chat-login-row"></div>
    </div>`;
  mountChatLogin();
}

async function mountChatLogin() {
  const row = document.getElementById("chat-login-row");
  if (!row) return;
  const stored = getToken();

  if (!stored) {
    row.innerHTML = `<button class="btn-twitch-login" id="twitch-login-btn">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
      Mit Twitch einloggen, um zu schreiben
    </button>`;
    document.getElementById("twitch-login-btn").addEventListener("click", startLogin);
    return;
  }

  row.innerHTML = `<p class="chat-send-note">Lade dein Twitch Profil…</p>`;
  try {
    const user = await getCurrentUser(stored.accessToken);
    if (!user) throw new Error("no user");
    const broadcasterId = await resolveBroadcasterId(stored.accessToken, TWITCH_CHANNEL);

    row.innerHTML = `
      <div class="chat-user">
        <img src="${user.profile_image_url}" alt="">
        <span class="name">${user.display_name}</span>
        <button class="cart-item-remove" id="twitch-logout-btn" style="margin-left:auto;">Abmelden</button>
      </div>
      <div class="chat-send-row">
        <input type="text" id="chat-send-input" placeholder="Nachricht an den Chat" maxlength="500">
        <button id="chat-send-btn">Senden</button>
      </div>
      <p class="chat-send-note" id="chat-send-status"></p>`;

    document.getElementById("twitch-logout-btn").addEventListener("click", () => logout());

    const input = document.getElementById("chat-send-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const status = document.getElementById("chat-send-status");

    async function send() {
      const message = input.value.trim();
      if (!message || !broadcasterId) return;
      sendBtn.disabled = true;
      try {
        await sendChatMessage(stored.accessToken, broadcasterId, user.id, message);
        input.value = "";
        status.textContent = "Gesendet.";
        setTimeout(() => (status.textContent = ""), 2000);
      } catch (err) {
        console.error("Send chat message failed:", err);
        status.textContent = "Senden fehlgeschlagen.";
      } finally {
        sendBtn.disabled = false;
      }
    }
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") send();
    });
  } catch (err) {
    console.error("Twitch profile load failed:", err);
    row.innerHTML = `<p class="chat-send-note">Twitch Login abgelaufen. <button class="btn-twitch-login" id="twitch-relogin-btn">Erneut einloggen</button></p>`;
    document.getElementById("twitch-relogin-btn")?.addEventListener("click", startLogin);
  }
}

// ---------- YouTube VOD-channel archive (unchanged behaviour) ----------

function vodCardHTML(video, watchlist) {
  const saved = watchlist.has(video.id);
  return `
  <a href="${video.url}" target="_blank" rel="noopener" class="vod-card rip reveal">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      <button class="watchlist-toggle${saved ? " is-saved" : ""}" data-watch-id="${video.id}" aria-label="Zur Watchlist" onclick="event.preventDefault()">${starIcon(saved)}</button>
    </div>
    <h3>${video.title}</h3>
    <div class="vod-date">${formatDate(video.publishedAt)}</div>
  </a>`;
}

function renderVods(videos, mode) {
  if (!vodGrid) return;
  const watchlist = getWatchlist();
  const list = mode === "watchlist" ? videos.filter((v) => watchlist.has(v.id)) : videos;

  if (!list.length) {
    vodGrid.innerHTML = `<div class="empty-state"><h2>${mode === "watchlist" ? "Watchlist ist leer" : "Noch keine Videos"}</h2><p>${mode === "watchlist" ? "Speicher Videos mit dem Stern, um sie hier wiederzufinden." : "Schau bald wieder vorbei."}</p></div>`;
    return;
  }
  vodGrid.innerHTML = list.map((v) => vodCardHTML(v, watchlist)).join("");
  vodGrid.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const updated = await toggleWatchlist(btn.dataset.watchId);
      if (mode === "watchlist" && !updated.has(btn.dataset.watchId)) {
        renderVods(videos, mode);
      } else {
        const isSaved = updated.has(btn.dataset.watchId);
        btn.classList.toggle("is-saved", isSaved);
        btn.innerHTML = starIcon(isSaved);
      }
    });
  });
  // vodCardHTML's <a> carries no id of its own, unlike the Twitch cards
  // below -- its real YouTube video URL (the href it already links to) is
  // the path value here.
  observeImpressions(".vod-card", (el) => el.getAttribute("href"), vodGrid);
}

function mountTabs(videos) {
  if (!sectionHead) return;
  const watchlistCount = videos.filter((v) => getWatchlist().has(v.id)).length;
  sectionHead.innerHTML = `
    <button class="filter-pill rip rip--accent is-active" data-mode="all">Alle Videos${videos.length ? ` (${videos.length})` : ""}</button>
    <button class="filter-pill rip" data-mode="watchlist">${starIcon(false)} Meine Watchlist${watchlistCount ? ` (${watchlistCount})` : ""}</button>`;
  sectionHead.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      sectionHead.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      renderVods(videos, pill.dataset.mode);
    });
  });
}

// ---------- Twitch VOD archive ----------
// The core of the gronkh.tv-style upgrade: past Twitch broadcasts get their
// own horizontal shelf ("Die neusten Streams") plus a second "Aus dem
// Archiv" discovery shelf, each card carrying the two real fields Twitch's
// API adds on top that YouTube's RSS feed doesn't — duration and view count.
//
// Deliberately NOT built here, and why:
// - A stream/episode number: Twitch's Get Videos endpoint has no such field,
//   and the archive only ever holds the last ~12 broadcasts (this site's
//   fetch script caps `first=12`), so a position-based "#N" would silently
//   renumber itself as old VODs roll off — presenting a fake stable index.
// - A "trending, last 30 days" row: the API gives a single lifetime
//   view_count snapshot, not a time-windowed one, so there's no honest way
//   to build that metric. A most-viewed sort is offered instead (see the
//   sort pills below), labelled for what it actually is.
// - A hero slide-selector cycling between multiple "featured" options:
//   there's only ever one latest item per priority tier shown in the hero at
//   a time (live, or the newest VOD, or the newest YouTube video) — nothing
//   to flip between yet.

function hasViewVariance(vods) {
  const vals = new Set(vods.map((v) => v.viewCount ?? 0));
  return vals.size > 1;
}

function twitchVodCardHTML(vod, tone = "") {
  const dur = formatTwitchDuration(vod.duration);
  const views = vod.viewCount != null ? formatViews(vod.viewCount) : "";
  const classes = ["vod-card", "rip", tone, "reveal"].filter(Boolean).join(" ");
  return `
  <a href="/vod/${vod.id}/" class="${classes}" data-twitch-vod-id="${vod.id}">
    <div class="vod-thumb">
      <img src="${vod.thumbnail}" alt="" loading="lazy">
      ${dur ? `<span class="vod-duration-badge">${dur}</span>` : ""}
    </div>
    <h3>${vod.title}</h3>
    <div class="twitch-card-meta">
      <span class="vod-date">${formatDateTime(vod.publishedAt)}</span>
      ${views ? `<span class="twitch-card-views">${eyeIcon()}${views}</span>` : ""}
    </div>
  </a>`;
}

function paintTwitchRow(list) {
  if (!twitchVodRow) return;
  if (!list.length) {
    twitchVodRow.innerHTML = `<div class="empty-state"><h2>Noch keine Twitch VODs</h2><p>Hier sammeln sich vergangene Streams, sobald welche archiviert sind. Bis dahin gibt's unten die YouTube Videos.</p></div>`;
    return;
  }
  // Cards are plain links to their own /vod/<id>/ page (see twitchVodCardHTML
  // above) -- no click handling needed here, native navigation already does
  // the right thing (including ctrl/cmd/middle-click opening a new tab).
  twitchVodRow.innerHTML = list.map((v) => twitchVodCardHTML(v)).join("");
  observeImpressions("[data-twitch-vod-id]", (el) => el.dataset.twitchVodId, twitchVodRow);
}

function renderTwitchArchive(vods, featuredId) {
  if (!twitchVodRow) return;

  // "Aus dem Archiv" shelf: a shuffled handful of past broadcasts distinct
  // from whatever the hero above is already showing — a second discovery
  // angle on top of the plain chronological shelf below. Only worth its own
  // row once there's a real pool of at least 3 other VODs to draw from —
  // otherwise it's either a duplicate of the featured VOD or a fake
  // "random" reshuffle of the same handful of cards already visible one
  // scroll down. The whole heading+row pair is toggled via display, not a
  // CSS :empty rule, since the heading text isn't JS-generated.
  if (twitchSpotlightWrap && twitchSpotlightRow) {
    const pool = vods.filter((v) => v.id !== featuredId);
    if (vods.length >= 4 && pool.length >= 3) {
      const picks = shuffledSample(pool, Math.min(6, pool.length));
      twitchSpotlightRow.innerHTML = picks.map((v) => twitchVodCardHTML(v, "rip--accent")).join("");
      observeImpressions("[data-twitch-vod-id]", (el) => el.dataset.twitchVodId, twitchSpotlightRow);
      twitchSpotlightWrap.style.display = "";
    } else {
      twitchSpotlightRow.innerHTML = "";
      twitchSpotlightWrap.style.display = "none";
    }
  }

  // Sort toggle: only shown once there's enough archive to reorder AND the
  // view counts actually differ — sorting four identical-looking numbers
  // isn't a real second angle on the data.
  if (twitchArchiveHead) {
    if (vods.length >= 4 && hasViewVariance(vods)) {
      twitchArchiveHead.innerHTML = `
        <button class="filter-pill rip rip--accent is-active" data-sort="new">Neueste</button>
        <button class="filter-pill rip" data-sort="views">Meistgesehen</button>`;
      twitchArchiveHead.querySelectorAll(".filter-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          twitchArchiveHead.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
          pill.classList.add("is-active");
          const ordered = pill.dataset.sort === "views" ? [...vods].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)) : vods;
          paintTwitchRow(ordered);
        });
      });
    } else {
      twitchArchiveHead.innerHTML = "";
    }
  }

  paintTwitchRow(vods);
}

async function init() {
  renderSkeletons();

  if (TWITCH_ENABLED) {
    if (consumeRedirect()) {
      // same-tab fallback path only; the popup path notifies via onAuthChange
    }
    onAuthChange(() => mountChatLogin());
  }

  const [status, twitchFeed, feed] = await Promise.all([
    TWITCH_ENABLED ? loadJSON("/assets/data/live-status.json", { live: false }) : Promise.resolve({ live: false }),
    TWITCH_ENABLED ? loadJSON("/assets/data/twitch-vods.json", { videos: [] }) : Promise.resolve({ videos: [] }),
    loadJSON("/assets/data/videos.json", { videos: [] }),
    getWatchlistIds().then((set) => (watchlistCache = set)),
  ]);

  const videos = feed.videos || [];
  const twitchVods = twitchFeed.videos || [];

  renderPlayer(status, twitchVods[0], videos[0]);
  renderChat(status);
  if (TWITCH_ENABLED) renderTwitchArchive(twitchVods, twitchVods[0]?.id);
  mountTabs(videos);
  renderVods(videos, "all");
}

init();
