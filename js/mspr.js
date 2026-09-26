// MSPR tab on /privat/ -- personal YouTube tools (MP3/MP4 downloader,
// thumbnail grabber, embed-code generator). Only the downloader needs the
// separate backend (js/mspr-config.js); the other two are pure client-side,
// zero server cost. Self-initializing module, wired independently of
// js/privat.js's own Firestore-heavy tabs -- this tab needs no Firestore
// reads/writes at all, and reuses the same owner-gating for free since the
// whole #privat-app wrapper it lives inside only ever becomes visible for
// the owner (see js/privat.js's onAuthChange handler).
import { MSPR_API_BASE } from "./mspr-config.js";

const API_CONFIGURED = MSPR_API_BASE && !MSPR_API_BASE.includes("your-app-name");

const MP4_QUALITIES = ["best", "2160p", "1440p", "1080p", "720p", "480p", "360p"];
const MP3_BITRATES = ["320", "256", "192", "128"];

const THUMB_SIZES = [
  { key: "maxresdefault", label: "Maximal (1280x720)" },
  { key: "sddefault", label: "Standard (640x480)" },
  { key: "hqdefault", label: "Hoch (480x360)" },
  { key: "mqdefault", label: "Mittel (320x180)" },
];

let currentVideoId = null;
let currentFormat = "mp3";
let healthState = "unknown"; // "unknown" | "checking" | "awake" | "asleep" | "unreachable"

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Same shapes js/product.js/server.js's own extractVideoId() accepts --
// full URL (watch/shorts/embed/live/youtu.be) or a bare 11-char id typed
// directly.
function extractVideoId(input) {
  const raw = String(input || "").trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === "youtu.be") return u.pathname.slice(1, 12);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {
    // not a valid URL -- fall through to null
  }
  return null;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function formatViews(n) {
  return new Intl.NumberFormat("de-DE").format(Number(n) || 0);
}

function statusHTML() {
  if (!API_CONFIGURED) {
    return `<span class="mspr-status mspr-status-off">Backend nicht eingerichtet</span>`;
  }
  const map = {
    unknown: ["", ""],
    checking: ["mspr-status-checking", "Prüfe Server…"],
    awake: ["mspr-status-ok", "Server bereit"],
    asleep: ["mspr-status-waking", "Server wacht auf…"],
    unreachable: ["mspr-status-off", "Server nicht erreichbar"],
  };
  const [cls, label] = map[healthState] || map.unknown;
  return label ? `<span class="mspr-status ${cls}">${label}</span>` : "";
}

function renderStatus() {
  const el = document.getElementById("mspr-status");
  if (el) el.innerHTML = statusHTML();
}

// Render's free tier sleeps the instance after 15 min idle -- the first
// request after that has a real (~30-50s) cold-start delay before it even
// answers /api/health, so this is deliberately given lots of room rather
// than being treated as "down" the moment a quick ping doesn't come back.
async function checkHealth() {
  if (!API_CONFIGURED) return false;
  healthState = "checking";
  renderStatus();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${MSPR_API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    healthState = res.ok ? "awake" : "unreachable";
  } catch {
    healthState = "asleep";
  }
  renderStatus();
  return healthState === "awake";
}

// Polls health until the free-tier instance finishes waking up (or a
// generous timeout passes), used right before an actual download so the
// user gets a clear "warte..." state instead of a request that just
// silently hangs for up to a minute.
async function waitForAwake(onTick) {
  const awake = await checkHealth();
  if (awake) return true;
  const deadline = Date.now() + 70000;
  while (Date.now() < deadline) {
    onTick?.();
    await new Promise((r) => setTimeout(r, 3000));
    const ok = await checkHealth();
    if (ok) return true;
  }
  return false;
}

function videoCardHTML(info) {
  return `
  <div class="mspr-video-card">
    ${info.thumbnail ? `<img class="mspr-video-thumb" src="${escapeHTML(info.thumbnail)}" alt="">` : ""}
    <div class="mspr-video-meta">
      <strong>${escapeHTML(info.title || "Unbekannter Titel")}</strong>
      <span>${escapeHTML(info.channel || "")} · ${formatDuration(info.duration)} · ${formatViews(info.viewCount)} Aufrufe</span>
      ${info.isLive ? `<span class="mspr-live-badge">Live gerade jetzt -- kann erst nach Ende heruntergeladen werden</span>` : ""}
    </div>
  </div>`;
}

function downloadControlsHTML() {
  const qualityOptions =
    currentFormat === "mp3"
      ? MP3_BITRATES.map((q) => `<option value="${q}"${q === "320" ? " selected" : ""}>${q} kbps</option>`).join("")
      : MP4_QUALITIES.map((q) => `<option value="${q}"${q === "best" ? " selected" : ""}>${q === "best" ? "Beste verfügbare" : q}</option>`).join("");

  return `
  <div class="mspr-download-row">
    <div class="mspr-format-tabs" role="tablist">
      <button type="button" class="mspr-format-tab${currentFormat === "mp3" ? " is-active" : ""}" data-format="mp3">MP3</button>
      <button type="button" class="mspr-format-tab${currentFormat === "mp4" ? " is-active" : ""}" data-format="mp4">MP4</button>
    </div>
    <select id="mspr-quality">${qualityOptions}</select>
    <button type="button" class="p-btn rip btn-accent" id="mspr-download-btn">Herunterladen</button>
  </div>
  <p class="mspr-download-note" id="mspr-download-note"></p>`;
}

function thumbGridHTML(videoId) {
  return `
  <div class="mspr-thumb-grid">
    ${THUMB_SIZES.map(
      (t) => `
      <div class="mspr-thumb-item">
        <img src="https://img.youtube.com/vi/${videoId}/${t.key}.jpg" alt="${escapeHTML(t.label)}" data-thumb-fallback="${videoId}">
        <a class="p-btn rip" href="https://img.youtube.com/vi/${videoId}/${t.key}.jpg" download="${videoId}-${t.key}.jpg" target="_blank" rel="noopener">${escapeHTML(t.label)}</a>
      </div>`
    ).join("")}
  </div>`;
}

function embedHTML(videoId) {
  const code = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  return `
  <div class="mspr-embed-box">
    <textarea id="mspr-embed-code" readonly rows="3">${escapeHTML(code)}</textarea>
    <button type="button" class="p-btn rip" id="mspr-embed-copy">Code kopieren</button>
  </div>`;
}

function showError(message) {
  const el = document.getElementById("mspr-result");
  if (el) el.innerHTML = `<p class="privat-error">${escapeHTML(message)}</p>`;
  document.getElementById("mspr-thumbs").innerHTML = "";
  document.getElementById("mspr-embed").innerHTML = "";
}

async function handleSubmit(rawUrl) {
  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    showError("Kein gültiger YouTube-Link oder Video-ID erkannt.");
    return;
  }
  currentVideoId = videoId;

  document.getElementById("mspr-thumbs").innerHTML = thumbGridHTML(videoId);
  document.getElementById("mspr-embed").innerHTML = embedHTML(videoId);
  wireThumbFallbacks();
  wireEmbedCopy();

  if (!API_CONFIGURED) {
    document.getElementById("mspr-result").innerHTML = `<p class="privat-hint">Downloader ist noch nicht eingerichtet -- Thumbnails und Embed-Code funktionieren trotzdem, siehe oben.</p>`;
    return;
  }

  const resultEl = document.getElementById("mspr-result");
  resultEl.innerHTML = `<p class="comments-empty">Lade Video-Infos…</p>`;
  checkHealth();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    const res = await fetch(`${MSPR_API_BASE}/api/info?url=${encodeURIComponent(videoId)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Video-Infos konnten nicht geladen werden.");
    }
    const info = await res.json();
    resultEl.innerHTML = videoCardHTML(info) + (info.isLive ? "" : downloadControlsHTML());
    if (!info.isLive) wireDownloadControls(videoId);
  } catch (err) {
    console.error("MSPR info fetch failed:", err);
    resultEl.innerHTML = `<p class="privat-error">${escapeHTML(err.message || "Video-Infos konnten nicht geladen werden. Ist der Server erreichbar?")}</p>`;
  }
}

function wireThumbFallbacks() {
  // maxresdefault.jpg doesn't exist for every video (older/lower-res
  // uploads never got one) -- YouTube serves a small grey placeholder
  // image instead of a real 404, so a naive onerror-swap won't trigger.
  // Checking the actual decoded size is the only reliable signal: the
  // placeholder is always exactly 120x90.
  document.querySelectorAll("[data-thumb-fallback]").forEach((img) => {
    img.addEventListener("load", () => {
      if (img.naturalWidth === 120 && img.naturalHeight === 90) {
        img.closest(".mspr-thumb-item")?.remove();
      }
    });
  });
}

function wireEmbedCopy() {
  document.getElementById("mspr-embed-copy")?.addEventListener("click", async (ev) => {
    const textarea = document.getElementById("mspr-embed-code");
    try {
      await navigator.clipboard.writeText(textarea.value);
      const btn = ev.currentTarget;
      const original = btn.textContent;
      btn.textContent = "Kopiert!";
      setTimeout(() => (btn.textContent = original), 1800);
    } catch {
      textarea.select();
    }
  });
}

function wireDownloadControls(videoId) {
  document.querySelectorAll(".mspr-format-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFormat = btn.dataset.format;
      const row = btn.closest(".mspr-download-row");
      row.outerHTML = downloadControlsHTML();
      wireDownloadControls(videoId);
    });
  });

  document.getElementById("mspr-download-btn")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    const quality = document.getElementById("mspr-quality").value;
    const note = document.getElementById("mspr-download-note");
    btn.disabled = true;
    btn.textContent = "Wird vorbereitet…";
    if (note) note.textContent = "";

    const awake = await waitForAwake(() => {
      btn.textContent = "Server wacht auf…";
      if (note) note.textContent = "Der kostenlose Server war eingeschlafen -- das kann bis zu einer Minute dauern.";
    });

    if (!awake) {
      btn.disabled = false;
      btn.textContent = "Herunterladen";
      if (note) note.textContent = "Server ist gerade nicht erreichbar. Bitte in Kürze erneut versuchen.";
      return;
    }

    btn.textContent = "Download startet…";
    const url = `${MSPR_API_BASE}/api/download?url=${encodeURIComponent(videoId)}&format=${currentFormat}&quality=${encodeURIComponent(quality)}`;
    // A plain navigation (not fetch+blob) lets the browser handle the
    // Content-Disposition:attachment response natively and stream straight
    // to disk -- no buffering the whole file in tab memory first, and no
    // CORS concerns since this isn't a fetch() read of the response body.
    window.location.href = url;

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Herunterladen";
      if (note) note.textContent = "Download gestartet -- prüfe deine Downloads.";
    }, 2500);
  });
}

function wireForm() {
  document.getElementById("mspr-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = document.getElementById("mspr-url");
    handleSubmit(input.value);
  });
}

// Lazy: only pings the backend once the MSPR tab is actually opened, not
// on every /privat/ page load regardless of which tab someone's using.
function wireLazyHealthCheck() {
  const tabBtn = document.querySelector('.privat-tab[data-tab="mspr"]');
  if (!tabBtn) return;
  let checked = false;
  tabBtn.addEventListener("click", () => {
    if (checked || !API_CONFIGURED) return;
    checked = true;
    renderStatus();
    checkHealth();
  });
}

wireForm();
wireLazyHealthCheck();
renderStatus();
