const WATCHLIST_KEY = "zevkev-watchlist";

const featuredEl = document.getElementById("yt-featured");
const gridEl = document.getElementById("yt-grid");
const filterBarEl = document.getElementById("yt-filter-bar");

function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
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

function renderFeatured(video) {
  if (!featuredEl) return;
  if (!video) {
    featuredEl.innerHTML = `<div class="empty-state"><h2>Noch keine Videos geladen</h2><p>Schau bald wieder vorbei.</p></div>`;
    return;
  }
  featuredEl.innerHTML = `
    <div class="yt-featured-frame rip">
      <iframe src="https://www.youtube.com/embed/${video.id}" allowfullscreen></iframe>
    </div>
    <div class="yt-featured-title">${video.title}</div>`;
}

function cardHTML(video, watchlist, isShort) {
  const saved = watchlist.has(video.id);
  return `
  <a href="${video.url}" target="_blank" rel="noopener" class="vod-card rip reveal${isShort ? " vod-card--short" : ""}">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      <button class="watchlist-toggle${saved ? " is-saved" : ""}" data-watch-id="${video.id}" aria-label="Zur Watchlist" onclick="event.preventDefault()">${starIcon(saved)}</button>
    </div>
    <h3>${video.title}</h3>
    <div class="vod-date">${formatDate(video.publishedAt)}</div>
  </a>`;
}

function renderGrid(videos, mode) {
  if (!gridEl) return;
  const list = mode === "shorts" ? videos.filter((v) => v.isShort) : videos.filter((v) => !v.isShort);
  gridEl.classList.toggle("yt-grid--shorts", mode === "shorts");

  if (!list.length) {
    gridEl.innerHTML = `<div class="empty-state"><h2>${mode === "shorts" ? "Noch keine Shorts" : "Noch keine Videos"}</h2><p>Schau bald wieder vorbei.</p></div>`;
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
}

function mountFilters(videos) {
  if (!filterBarEl) return;
  const videoCount = videos.filter((v) => !v.isShort).length;
  const shortsCount = videos.filter((v) => v.isShort).length;
  filterBarEl.innerHTML = `
    <button class="filter-pill rip rip--accent is-active" data-mode="videos">Videos${videoCount ? ` (${videoCount})` : ""}</button>
    <button class="filter-pill rip" data-mode="shorts">Shorts${shortsCount ? ` (${shortsCount})` : ""}</button>`;
  filterBarEl.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      filterBarEl.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      renderGrid(videos, pill.dataset.mode);
    });
  });
}

async function init() {
  const feed = await loadJSON("/assets/data/main-videos.json", { videos: [] });
  const videos = feed.videos || [];
  renderFeatured(videos[0]);
  mountFilters(videos);
  renderGrid(videos, "videos");
}

init();
