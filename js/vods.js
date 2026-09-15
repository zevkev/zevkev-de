import { consumeRedirect, getToken, startLogin, logout, getCurrentUser, resolveBroadcasterId, sendChatMessage } from "./twitch-auth.js";

const TWITCH_CHANNEL = "zevkev_";
const WATCHLIST_KEY = "zevkev-watchlist";

const playerCol = document.getElementById("player-col");
const chatCol = document.getElementById("chat-col");
const vodGrid = document.getElementById("vod-grid");
const sectionHead = document.getElementById("vod-section-head");

function parentParams() {
  const hosts = new Set([location.hostname, "zevkev.de", "www.zevkev.de", "localhost", "127.0.0.1"]);
  return [...hosts].map((h) => `parent=${encodeURIComponent(h)}`).join("&");
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
function toggleWatchlist(id) {
  const list = getWatchlist();
  if (list.has(id)) list.delete(id);
  else list.add(id);
  saveWatchlist(list);
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

function renderPlayer(status, latestVideo) {
  if (!playerCol) return;
  if (status.live) {
    playerCol.innerHTML = `
      <div class="player-wrap rip">
        <span class="status-badge is-live"><span class="dot"></span> Live</span>
        <iframe src="https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&${parentParams()}&muted=false" allowfullscreen></iframe>
      </div>
      <div class="player-meta">
        <h2>${status.title || "Live auf Twitch"}</h2>
        <p>${status.game ? `${status.game} · ` : ""}${status.viewerCount != null ? `${status.viewerCount} Zuschauer` : ""}</p>
      </div>`;
  } else if (latestVideo) {
    playerCol.innerHTML = `
      <div class="player-wrap rip">
        <span class="status-badge is-offline">Offline</span>
        <iframe src="https://www.youtube.com/embed/${latestVideo.id}" allowfullscreen></iframe>
      </div>
      <div class="player-meta">
        <h2>${latestVideo.title}</h2>
        <p>Gerade nicht live — hier das neueste Video vom VOD-Kanal.</p>
      </div>`;
  } else {
    playerCol.innerHTML = `
      <div class="player-wrap rip" style="display:flex; align-items:center; justify-content:center; color:#fff;">
        <span class="status-badge is-offline">Offline</span>
        <p>Gerade kein Stream und noch keine VODs geladen. Schau später nochmal vorbei!</p>
      </div>`;
  }
}

function renderChat(status) {
  if (!chatCol) return;
  if (!status.live) {
    chatCol.innerHTML = `
      <div class="chat-panel rip">
        <h2>Live-Chat</h2>
        <div class="chat-offline-note">Der Chat ist nur während Live-Streams aktiv.<br>Bis dahin: schau in den <a href="/#discord">Discord</a>.</div>
      </div>`;
    return;
  }
  chatCol.innerHTML = `
    <div class="chat-panel rip">
      <h2>Live-Chat</h2>
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

  row.innerHTML = `<p class="chat-send-note">Lade dein Twitch-Profil…</p>`;
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
        <input type="text" id="chat-send-input" placeholder="Nachricht an den Chat…" maxlength="500">
        <button id="chat-send-btn">Senden</button>
      </div>
      <p class="chat-send-note" id="chat-send-status"></p>`;

    document.getElementById("twitch-logout-btn").addEventListener("click", () => {
      logout();
      mountChatLogin();
    });

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
        status.textContent = "Gesendet ✅";
        setTimeout(() => (status.textContent = ""), 2000);
      } catch (err) {
        console.error("Send chat message failed:", err);
        status.textContent = "⚠️ Senden fehlgeschlagen.";
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
    row.innerHTML = `<p class="chat-send-note">⚠️ Twitch-Login abgelaufen. <button class="btn-twitch-login" id="twitch-relogin-btn">Erneut einloggen</button></p>`;
    document.getElementById("twitch-relogin-btn")?.addEventListener("click", startLogin);
  }
}

function vodCardHTML(video, watchlist) {
  const saved = watchlist.has(video.id);
  return `
  <a href="${video.url}" target="_blank" rel="noopener" class="vod-card rip reveal">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      <button class="watchlist-toggle${saved ? " is-saved" : ""}" data-watch-id="${video.id}" aria-label="Zur Watchlist" onclick="event.preventDefault()">${saved ? "★" : "☆"}</button>
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
    vodGrid.innerHTML = `<div class="empty-state"><h2>${mode === "watchlist" ? "Watchlist ist leer" : "Noch keine VODs"}</h2><p>${mode === "watchlist" ? "Speicher Videos mit dem ☆, um sie hier wiederzufinden." : "Schau bald wieder vorbei."}</p></div>`;
    return;
  }
  vodGrid.innerHTML = list.map((v) => vodCardHTML(v, watchlist)).join("");
  vodGrid.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const updated = toggleWatchlist(btn.dataset.watchId);
      if (mode === "watchlist" && !updated.has(btn.dataset.watchId)) {
        renderVods(videos, mode);
      } else {
        btn.classList.toggle("is-saved", updated.has(btn.dataset.watchId));
        btn.textContent = updated.has(btn.dataset.watchId) ? "★" : "☆";
      }
    });
  });
}

function mountTabs(videos) {
  if (!sectionHead) return;
  sectionHead.innerHTML = `
    <button class="filter-pill rip rip--accent is-active" data-mode="all">Alle VODs</button>
    <button class="filter-pill rip" data-mode="watchlist">☆ Meine Watchlist</button>`;
  sectionHead.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      sectionHead.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      renderVods(videos, pill.dataset.mode);
    });
  });
}

async function init() {
  consumeRedirect();

  const [status, feed] = await Promise.all([
    loadJSON("/assets/data/live-status.json", { live: false }),
    loadJSON("/assets/data/videos.json", { videos: [] }),
  ]);

  const videos = feed.videos || [];
  renderPlayer(status, videos[0]);
  renderChat(status);
  mountTabs(videos);
  renderVods(videos, "all");
}

init();
