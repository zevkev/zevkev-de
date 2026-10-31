// Mehr / ZevKev+ page (/vods/).
//
// Hero, first match wins: Twitch live player (Twitch on and live), newest
// Twitch VOD (Twitch on), newest ZevKev+ video. Below it the Twitch archive
// (Twitch on only) and the ZevKev+ YouTube channel. Every card and button is
// a plain link to Twitch or YouTube in the same tab. The only thing that
// plays on this site is the embedded Twitch live player.
//
// With Twitch off (twitch.txt) the page is "ZevKev+": no Twitch data is
// fetched and nothing Twitch related is rendered.
import { twitchEnabled } from "/js/twitch.js";
import { initReveal } from "/js/reveal.js";
import { brandIcon } from "/js/layout.js";
import { cleanText } from "/js/text.js";

const TWITCH_CHANNEL = "zevkev_";
const TWITCH_CHANNEL_URL = `https://www.twitch.tv/${TWITCH_CHANNEL}`;
const PLUS_CHANNEL_URL = "https://www.youtube.com/channel/UCTTbSiyRUop-hMeZGIJD_QA";
const DATA = {
  live: "/assets/data/live-status.json",
  twitch: "/assets/data/twitch-vods.json",
  plus: "/assets/data/videos.json",
};
const PAGE_SIZE = 12;
// live-status.json comes from a GitHub Actions cron that GitHub sometimes
// runs hours late, so only a really old status is ignored. That keeps a dead
// workflow from leaving a "live" hero up forever.
const LIVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TEARS = ["", "paper-b", "paper-c"];

const byId = (id) => document.getElementById(id);
const els = {
  hero: byId("vods-hero"),
  streamsGrid: byId("streams-grid"),
  plusGrid: byId("plus-grid"),
  plusSort: byId("plus-sort"),
  plusMore: byId("plus-more"),
  plusChannel: byId("plus-channel"),
};

// ---------- Icons ----------
const STROKE_ICONS = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M19 13.5h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  history: '<path d="M3 4v6h6"/><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6.5L3 10"/><path d="M12 8v4l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="m16.5 10 5-3v10l-5-3"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STROKE_ICONS[name]}</svg>`;
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

// ---------- Helpers ----------
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\/[^\s"'<>]+$/.test(value) ? value : "";
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeOf(value) {
  return toDate(value)?.getTime() ?? 0;
}

const NUMBER = new Intl.NumberFormat("de-DE");
const DATE_LONG = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });
const DATE_SHORT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

function dateHTML(value, { long = false, withTime = false } = {}) {
  const date = toDate(value);
  if (!date) return "";
  let text = (long ? DATE_LONG : DATE_SHORT).format(date);
  if (withTime) text += `, ${TIME.format(date)} Uhr`;
  return `<time datetime="${escapeHTML(date.toISOString())}">${escapeHTML(text)}</time>`;
}

function viewsText(n) {
  return `${NUMBER.format(n)} ${n === 1 ? "Aufruf" : "Aufrufe"}`;
}

// Twitch durations look like "3h24m10s" (zero parts left out).
function parseTwitchDuration(raw) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(String(raw ?? "").trim());
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function clockText(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function sinceText(startedAt) {
  const start = timeOf(startedAt);
  if (!start) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
  if (minutes < 1) return "gerade gestartet";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `seit ${m} Min.`;
  return m ? `seit ${h} Std. ${m} Min.` : `seit ${h} Std.`;
}

// First paragraph of a YouTube description, without the link blocks below
// the "-----" separators.
function excerpt(description) {
  if (typeof description !== "string") return "";
  const lines = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[-_=*~]{3,}/.test(line)) break;
    if (line) lines.push(line);
  }
  return cleanText(lines.join(" ").replace(/https?:\/\/\S+/g, ""));
}

// ---------- Data ----------
async function loadJSON(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`${url} konnte nicht geladen werden:`, err);
    return null;
  }
}

// The Helix API hands out thumbnail templates (".../thumb0-%{width}x%{height}.jpg").
// scripts/fetch-twitch-status.mjs already fills in 440x248, this covers raw ones.
function twitchThumb(url) {
  return httpsUrl(url).replace(/%\{width\}/g, "640").replace(/%\{height\}/g, "360");
}

// Bigger version of a sized Twitch thumbnail for the hero. The CDN renders
// any size from the same path; the hero falls back to the original if not.
function twitchThumbLarge(url) {
  return url.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, "-1280x720$1");
}

function normalizeTwitchVods(data) {
  if (!data || !Array.isArray(data.videos)) return null;
  const seen = new Set();
  return data.videos
    .filter((v) => v && /^\d+$/.test(String(v.id)) && !seen.has(String(v.id)) && seen.add(String(v.id)))
    .map((v) => ({
      id: String(v.id),
      title: cleanText(v.title) || "Twitch Stream",
      publishedAt: v.publishedAt,
      thumbnail: twitchThumb(v.thumbnail),
      seconds: parseTwitchDuration(v.duration),
      views: Number.isFinite(v.viewCount) ? v.viewCount : null,
      url: `https://www.twitch.tv/videos/${v.id}`,
    }))
    .sort((a, b) => timeOf(b.publishedAt) - timeOf(a.publishedAt));
}

function normalizePlusVideos(data) {
  if (!data || !Array.isArray(data.videos)) return null;
  const seen = new Set();
  return data.videos
    .filter((v) => v && /^[\w-]{11}$/.test(String(v.id)) && !seen.has(String(v.id)) && seen.add(String(v.id)))
    .map((v) => ({
      id: String(v.id),
      title: cleanText(v.title) || "Video",
      publishedAt: v.publishedAt,
      thumbnail: httpsUrl(v.thumbnail) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      description: v.description,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }))
    .sort((a, b) => timeOf(b.publishedAt) - timeOf(a.publishedAt));
}

function plusChannelUrl(data) {
  const url = httpsUrl(data?.channelUrl || data?.channel?.url);
  if (/^https:\/\/www\.youtube\.com\/./.test(url)) return url;
  const id = data?.channelId || data?.channel?.id;
  if (typeof id === "string" && /^UC[\w-]{22}$/.test(id)) return `https://www.youtube.com/channel/${id}`;
  return PLUS_CHANNEL_URL;
}

function liveStream(status) {
  if (!status || status.live !== true) return null;
  const checkedAt = timeOf(status.checkedAt);
  if (checkedAt && Date.now() - checkedAt > LIVE_MAX_AGE_MS) return null;
  return {
    title: cleanText(status.title),
    game: cleanText(status.game),
    startedAt: toDate(status.startedAt) ? status.startedAt : null,
    viewers: Number.isFinite(status.viewerCount) ? status.viewerCount : null,
  };
}

// ---------- Hero ----------
function stageHTML(inner, { live = false } = {}) {
  // The live stage paints its shadow on a separate layer (see vods.css), so
  // the player iframe never sits inside a CSS filter.
  return `
  <div class="paper vods-stage${live ? " vods-stage--live" : ""}">
    ${live ? '<div class="vods-stage-shadow" aria-hidden="true"></div>' : ""}
    <div class="tape" aria-hidden="true"></div>
    <div class="vods-stage-grid">${inner}</div>
  </div>`;
}

function heroTitleHTML(text) {
  // Long titles get a smaller size; past four lines the CSS clamps them and
  // the full text stays available as a tooltip.
  const long = text.length > 64;
  return `<h2 id="vods-hero-title" class="vods-hero-title${long ? ` vods-hero-title--long" title="${escapeHTML(text)}` : ""}">${escapeHTML(text)}</h2>`;
}

function metaHTML(items) {
  const list = items.filter((item) => item && item[1]);
  if (!list.length) return "";
  return `<ul class="vods-meta">${list.map(([name, html]) => `<li>${icon(name)}<span>${html}</span></li>`).join("")}</ul>`;
}

function mediaHTML({ href, tone, src, fallback, duration }) {
  const img = src
    ? `<img src="${escapeHTML(src)}"${fallback && fallback !== src ? ` data-fallback="${escapeHTML(fallback)}"` : ""} alt="" fetchpriority="high" decoding="async">`
    : `<span class="vods-thumb-fallback">${brandIcon(tone === "yt" ? "youtube" : "twitch")}</span>`;
  return `
    <a class="vods-media vods-media--${tone}" href="${escapeHTML(href)}" tabindex="-1" aria-hidden="true">
      ${img}
      <span class="vods-play">${PLAY_ICON}</span>
      ${duration ? `<span class="video-duration">${duration}</span>` : ""}
    </a>`;
}

function offlineNoteHTML() {
  return `
    <div class="vods-note">
      <p class="vods-note-text">
        <span class="vods-note-status"><span class="vods-note-dot" aria-hidden="true"></span>Gerade offline</span>
        Folg mir auf Twitch, dann verpasst du den nächsten Stream nicht.
      </p>
      <a class="btn btn-sm" href="${TWITCH_CHANNEL_URL}">${brandIcon("twitch", "vods-ico-twitch")}Auf Twitch folgen</a>
    </div>`;
}

function liveHeroHTML(stream) {
  const src = `https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=${encodeURIComponent(location.hostname)}&muted=false`;
  const since = sinceText(stream.startedAt);
  return stageHTML(
    `
    <div class="vods-player">
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_35%,#3b2370,#140d24_70%)] p-6 text-center text-white">
        <span class="flex size-14 items-center justify-center rounded-full bg-twitch [&>svg]:size-7">${brandIcon("twitch")}</span>
        <p class="font-display text-3xl">Livestream hier ansehen</p>
        <p class="max-w-md text-sm leading-relaxed text-white/75">Erst beim Klick wird der Player von Twitch geladen. Dabei werden Daten wie deine IP Adresse an Twitch übertragen und Twitch kann Cookies setzen. Mehr dazu in der <a class="font-semibold text-white underline" href="/datenschutz/#twitch">Datenschutzerklärung</a>.</p>
        <button type="button" class="btn btn-twitch" data-load-player="${escapeHTML(src)}">${PLAY_ICON}Player laden</button>
      </div>
    </div>
    <div class="vods-info">
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge badge-live">Live</span>
        <span class="badge vods-badge-twitch">${brandIcon("twitch")}Twitch</span>
      </div>
      ${heroTitleHTML(stream.title || "Live auf Twitch")}
      ${metaHTML([
        ["gamepad", escapeHTML(stream.game)],
        ["users", stream.viewers != null ? `${NUMBER.format(stream.viewers)} Zuschauer` : ""],
        ["clock", since ? `<span data-live-since="${escapeHTML(stream.startedAt)}">${since}</span>` : ""],
      ])}
      <div class="vods-actions">
        <a class="btn btn-twitch" href="${TWITCH_CHANNEL_URL}">${brandIcon("twitch")}Auf Twitch öffnen</a>
        <a class="btn" href="${TWITCH_CHANNEL_URL}">${icon("chat")}Zum Twitch Chat</a>
      </div>
    </div>`,
    { live: true }
  );
}

function vodHeroHTML(vod) {
  return stageHTML(`
    ${mediaHTML({
      href: vod.url,
      tone: "twitch",
      src: vod.thumbnail && twitchThumbLarge(vod.thumbnail),
      fallback: vod.thumbnail,
      duration: clockText(vod.seconds),
    })}
    <div class="vods-info">
      <span class="badge vods-badge-twitch">${brandIcon("twitch")}Neuster Stream</span>
      ${heroTitleHTML(vod.title)}
      ${metaHTML([
        ["calendar", dateHTML(vod.publishedAt, { long: true, withTime: true })],
        ["eye", vod.views != null ? viewsText(vod.views) : ""],
      ])}
      <div class="vods-actions">
        <a class="btn btn-twitch" href="${vod.url}">${PLAY_ICON}Auf Twitch ansehen</a>
      </div>
      ${offlineNoteHTML()}
    </div>`);
}

function plusHeroHTML(video, twitchOn) {
  const text = excerpt(video.description);
  return stageHTML(`
    ${mediaHTML({
      href: video.url,
      tone: "yt",
      src: `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
      fallback: video.thumbnail,
    })}
    <div class="vods-info">
      <span class="badge vods-badge-yt">${brandIcon("youtube")}Neustes Video</span>
      ${heroTitleHTML(video.title)}
      ${metaHTML([["calendar", dateHTML(video.publishedAt, { long: true })]])}
      ${text ? `<p class="vods-excerpt">${escapeHTML(text)}</p>` : ""}
      <div class="vods-actions">
        <a class="btn btn-yt" href="${video.url}">${PLAY_ICON}Auf YouTube ansehen</a>
      </div>
      ${twitchOn ? offlineNoteHTML() : ""}
    </div>`);
}

// YouTube answers a missing maxresdefault.jpg with a 120x90 placeholder
// (sometimes as an error, sometimes as a "loaded" image), so both count.
function wireImageFallbacks(root) {
  root.querySelectorAll("img[data-fallback]").forEach((img) => {
    const swap = () => {
      const next = img.dataset.fallback;
      if (!next) return;
      img.removeAttribute("data-fallback");
      img.src = next;
    };
    const check = () => {
      if (img.naturalWidth > 0 && img.naturalWidth <= 120) swap();
    };
    img.addEventListener("error", swap, { once: true });
    img.addEventListener("load", check);
    if (img.complete) {
      if (img.naturalWidth === 0) swap();
      else check();
    }
  });
}

let sinceTimer = 0;
function startSinceTicker() {
  clearInterval(sinceTimer);
  sinceTimer = setInterval(() => {
    const el = document.querySelector("[data-live-since]");
    if (!el) {
      clearInterval(sinceTimer);
      return;
    }
    el.textContent = sinceText(el.dataset.liveSince);
  }, 30000);
}

// Two-click embed: nothing from Twitch loads until the visitor asks for it.
els.hero.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-load-player]");
  if (!btn) return;
  const frame = document.createElement("iframe");
  frame.src = btn.dataset.loadPlayer;
  frame.title = "Twitch Livestream von ZevKev";
  frame.allow = "autoplay; picture-in-picture";
  frame.allowFullscreen = true;
  btn.closest(".vods-player").replaceChildren(frame);
});

function renderHero({ twitchOn, live, vods, videos }) {
  const hero = els.hero;
  let html = "";
  if (live) html = liveHeroHTML(live);
  else if (twitchOn && vods?.length) html = vodHeroHTML(vods[0]);
  else if (videos?.length) html = plusHeroHTML(videos[0], twitchOn);

  hero.removeAttribute("aria-busy");
  if (!html) {
    // Nothing to feature: the sections below show the empty or error state.
    hero.innerHTML = "";
    hero.hidden = true;
    return;
  }
  hero.innerHTML = html;
  hero.removeAttribute("aria-label");
  hero.setAttribute("aria-labelledby", "vods-hero-title");
  wireImageFallbacks(hero);
  if (live) startSinceTicker();
}

// ---------- Grids ----------
function cardClass(index) {
  return ["paper", TEARS[index % TEARS.length], "paper-lift", "video-card", "reveal"].filter(Boolean).join(" ");
}

const SEP = '<span class="vods-sep" aria-hidden="true">·</span>';

function thumbFallbackHTML(tone) {
  return `<span class="vods-thumb-fallback">${brandIcon(tone === "yt" ? "youtube" : "twitch")}</span>`;
}

function twitchCardHTML(vod, index) {
  const duration = clockText(vod.seconds);
  const meta = [dateHTML(vod.publishedAt), vod.views != null ? viewsText(vod.views) : ""].filter(Boolean).join(SEP);
  return `
  <a class="${cardClass(index)}" href="${vod.url}">
    <div class="video-thumb">
      ${vod.thumbnail ? `<img src="${escapeHTML(vod.thumbnail)}" alt="" loading="lazy" decoding="async">` : thumbFallbackHTML("twitch")}
      ${duration ? `<span class="video-duration">${duration}</span>` : ""}
    </div>
    <div class="video-title">${escapeHTML(vod.title)}</div>
    ${meta ? `<div class="video-meta">${meta}</div>` : ""}
  </a>`;
}

function plusCardHTML(video, index) {
  const date = dateHTML(video.publishedAt);
  return `
  <a class="${cardClass(index)}" href="${video.url}">
    <div class="video-thumb">
      <img src="${escapeHTML(video.thumbnail)}" alt="" loading="lazy" decoding="async">
    </div>
    <div class="video-title">${escapeHTML(video.title)}</div>
    ${date ? `<div class="video-meta">${date}</div>` : ""}
  </a>`;
}

function noteHTML({ tone, iconName, title, text, actions = "" }) {
  return `
  <div class="paper paper-${tone} vods-empty">
    <span class="vods-empty-icon">${icon(iconName)}</span>
    <h3 class="vods-empty-title">${title}</h3>
    <p>${text}</p>
    ${actions ? `<div class="vods-empty-actions">${actions}</div>` : ""}
  </div>`;
}

const RELOAD_BUTTON = `<button type="button" class="btn btn-sm" data-reload>${icon("refresh")}Neu laden</button>`;

function activateCards(root) {
  initReveal(root);
}

function renderStreams(vods) {
  const grid = els.streamsGrid;
  grid.removeAttribute("aria-busy");
  if (vods === null) {
    grid.innerHTML = noteHTML({
      tone: "pink",
      iconName: "alert",
      title: "Streams konnten nicht geladen werden",
      text: "Da hat gerade etwas nicht geklappt. Lade die Seite neu oder schau direkt auf Twitch vorbei.",
      actions: `${RELOAD_BUTTON}<a class="btn btn-sm btn-twitch" href="${TWITCH_CHANNEL_URL}">${brandIcon("twitch")}Zu Twitch</a>`,
    });
    return;
  }
  if (!vods.length) {
    grid.innerHTML = noteHTML({
      tone: "sky",
      iconName: "history",
      title: "Gerade keine Streams im Archiv",
      text: "Twitch hebt vergangene Streams nur eine Weile auf. Sobald wieder einer da ist, findest du ihn hier.",
      actions: `<a class="btn btn-sm btn-twitch" href="${TWITCH_CHANNEL_URL}">${brandIcon("twitch")}Zum Twitch Kanal</a>`,
    });
    return;
  }
  grid.innerHTML = vods.slice(0, PAGE_SIZE).map(twitchCardHTML).join("");
  activateCards(grid);
}

const plus = { list: [], sort: "new", shown: 0 };

function renderPlusPage({ reset = false } = {}) {
  const grid = els.plusGrid;
  const ordered = plus.sort === "old" ? [...plus.list].reverse() : plus.list;
  if (reset) {
    grid.innerHTML = "";
    plus.shown = 0;
  }
  const batch = ordered.slice(plus.shown, plus.shown + PAGE_SIZE);
  grid.insertAdjacentHTML("beforeend", batch.map((video, i) => plusCardHTML(video, plus.shown + i)).join(""));
  const firstNew = grid.children[plus.shown] || null;
  plus.shown += batch.length;
  els.plusMore.hidden = plus.shown >= ordered.length;
  activateCards(grid);
  return firstNew;
}

function renderPlus(videos) {
  const grid = els.plusGrid;
  grid.removeAttribute("aria-busy");
  if (!videos || !videos.length) {
    els.plusMore.hidden = true;
    grid.innerHTML = videos
      ? noteHTML({
          tone: "sky",
          iconName: "video",
          title: "Noch keine Videos",
          text: "Hier ist gerade noch nichts. Schau bald wieder vorbei.",
        })
      : noteHTML({
          tone: "pink",
          iconName: "alert",
          title: "Videos konnten nicht geladen werden",
          text: "Da hat gerade etwas nicht geklappt. Lade die Seite neu oder schau direkt auf YouTube vorbei.",
          actions: RELOAD_BUTTON,
        });
    return;
  }
  plus.list = videos;
  els.plusSort.hidden = videos.length < 2;
  renderPlusPage({ reset: true });
}

function wireControls() {
  els.plusSort.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-sort]");
    if (!btn || btn.dataset.sort === plus.sort) return;
    plus.sort = btn.dataset.sort;
    els.plusSort.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    renderPlusPage({ reset: true });
  });
  els.plusMore.addEventListener("click", () => {
    const firstNew = renderPlusPage();
    // The button disappears after the last page, so focus moves to the new cards.
    if (els.plusMore.hidden) firstNew?.focus({ preventScroll: true });
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest?.("[data-reload]")) location.reload();
  });
}

// ---------- Init ----------
async function init() {
  if (!els.hero || !els.plusGrid) return;
  wireControls();

  const plusRequest = loadJSON(DATA.plus);
  const twitchOn = await twitchEnabled();
  document.title = twitchOn ? "Mehr | ZevKev" : "ZevKev+ | ZevKev";

  const [status, twitchData, plusData] = await Promise.all([
    twitchOn ? loadJSON(DATA.live) : null,
    twitchOn ? loadJSON(DATA.twitch) : null,
    plusRequest,
  ]);

  const live = twitchOn ? liveStream(status) : null;
  const vods = twitchOn ? normalizeTwitchVods(twitchData) : null;
  const videos = normalizePlusVideos(plusData);
  if (plusData) els.plusChannel.href = plusChannelUrl(plusData);

  renderHero({ twitchOn, live, vods, videos });
  if (twitchOn) renderStreams(vods);
  renderPlus(videos);
}

init().catch((err) => {
  console.error("Mehr Seite konnte nicht aufgebaut werden:", err);
  els.hero.hidden = true;
  renderStreams(null);
  renderPlus(null);
});
