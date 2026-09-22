// Dedicated live-stream page -- player + real live chat side by side (this
// one, unlike VOD chat replay, Twitch's embed API genuinely supports: see
// the comment in js/watch.js). Shows only live-or-offline, deliberately not
// falling back to the latest VOD/YouTube video the way the Mehr page's hero
// does -- a page named "Live" showing a pre-recorded video when offline
// would be confusing, the Mehr page already covers that case.
import { TWITCH_ENABLED } from "./config.js";
import { consumeRedirect, getToken, startLogin, logout, getCurrentUser, resolveBroadcasterId, sendChatMessage, onAuthChange } from "./twitch-auth.js";
import { track } from "./track.js";

const TWITCH_CHANNEL = "zevkev_";

const playerEl = document.getElementById("live-player");
const metaEl = document.getElementById("live-meta");
const chatColEl = document.getElementById("live-chat-col");

function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function clockIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
}
function gameIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M19 13h.01"/></svg>`;
}
function twitchGlyph() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`;
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

function parentParams() {
  const hosts = new Set([location.hostname, "zevkev.de", "www.zevkev.de", "localhost", "127.0.0.1"]);
  return [...hosts].map((h) => `parent=${encodeURIComponent(h)}`).join("&");
}
function parentHosts() {
  return [...new Set([location.hostname, "zevkev.de", "www.zevkev.de", "localhost", "127.0.0.1"])];
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

let liveTickerId = null;

function renderOffline() {
  playerEl.innerHTML = `
    <div class="player-wrap player-empty rip">
      <div class="live-offline-note">
        <h2>Gerade nicht live</h2>
        <p>Schau später wieder vorbei, oder sieh dir in der Zwischenzeit die <a href="/vods/">Streams und Videos</a> an.</p>
      </div>
    </div>`;
  metaEl.innerHTML = TWITCH_ENABLED
    ? `<a class="p-btn rip" href="https://www.twitch.tv/${TWITCH_CHANNEL}" target="_blank" rel="noopener">${twitchGlyph()} Auf Twitch folgen</a>`
    : "";
  if (chatColEl) chatColEl.innerHTML = "";
}

function renderLive(status) {
  playerEl.innerHTML = `
    <div class="player-wrap player-wrap--live rip">
      <div id="live-target" style="width:100%;height:100%;"></div>
    </div>`;

  const stats = [
    status.game ? `<span class="watch-stat">${gameIcon()}${status.game}</span>` : "",
    status.viewerCount != null ? `<span class="watch-stat">${eyeIcon()}${formatViews(status.viewerCount)} Zuschauer</span>` : "",
    status.startedAt ? `<span class="watch-stat">${clockIcon()}seit <span id="live-elapsed">${formatElapsedSince(status.startedAt)}</span></span>` : "",
  ].filter(Boolean).join("");

  metaEl.innerHTML = `
    <h1 class="watch-title">${escapeHTML(status.title || "Live auf Twitch")}</h1>
    <div class="watch-stats">${stats}</div>
    <a class="p-btn rip btn-accent" href="https://www.twitch.tv/${TWITCH_CHANNEL}" target="_blank" rel="noopener">${twitchGlyph()} Auf Twitch ansehen</a>`;

  if (status.startedAt) {
    if (liveTickerId) clearInterval(liveTickerId);
    liveTickerId = setInterval(() => {
      const el = document.getElementById("live-elapsed");
      if (!el) {
        clearInterval(liveTickerId);
        return;
      }
      el.textContent = formatElapsedSince(status.startedAt);
    }, 30000);
  }

  const tracker = createWatchTimeTracker(`live:${TWITCH_CHANNEL}`);
  ensureTwitchSDK().then((Twitch) => {
    const el = document.getElementById("live-target");
    if (!el) return;
    const player = new Twitch.Player("live-target", {
      channel: TWITCH_CHANNEL,
      parent: parentHosts(),
      muted: false,
      autoplay: true,
      width: "100%",
      height: "100%",
    });
    player.addEventListener(Twitch.Player.PLAY, () => tracker.start());
    player.addEventListener(Twitch.Player.PAUSE, () => tracker.stop());
    player.addEventListener(Twitch.Player.ENDED, () => tracker.stop());
  });

  renderChat();
}

function renderChat() {
  if (!chatColEl || !TWITCH_ENABLED) return;
  chatColEl.innerHTML = `
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
    row.innerHTML = `<button class="btn-twitch-login" id="twitch-login-btn">${twitchGlyph()}Mit Twitch einloggen, um zu schreiben</button>`;
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

async function init() {
  if (!TWITCH_ENABLED) {
    renderOffline();
    return;
  }
  consumeRedirect();
  onAuthChange(() => mountChatLogin());

  const status = await loadJSON("/assets/data/live-status.json", { live: false });
  if (status.live) renderLive(status);
  else renderOffline();
}

// js/flags.js fires this once its background Firestore check finds the
// site-wide Twitch flag differs from what this page already loaded with
// (e.g. an admin flipped it in /privat/ while this tab was open). This
// page's whole init() branches on TWITCH_ENABLED once at load time, so a
// clean reload is the safe way to pick that up -- no risk of a live Twitch
// player/chat iframe or watch-time tracker being left half torn-down by a
// partial re-render.
window.addEventListener("zevkev:twitch-flag-updated", () => location.reload(), { once: true });

init();
