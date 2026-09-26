// Account page (/account/): profile (avatar + rename), watchlist overview,
// and account deletion. Owner-agnostic -- any signed-in visitor sees their
// own account here, not just kevlevin.zev@gmail.com (that's /privat/'s job).
import {
  auth,
  db,
  onAuthChange,
  updateDisplayName,
  deleteAccount,
  signOutUser,
  authErrorMessage,
  AVATAR_COLORS,
  AVATAR_ICONS,
  AVATAR_SHAPES,
  AVATAR_ACCESSORIES,
  parseAvatarPrefs,
  avatarContentHTML,
  avatarShapeClass,
  avatarBadgeHTML,
  updateAvatarPrefs,
  updateProfileCustomization,
} from "./auth.js";
import { getWatchlistIds, toggleWatchlistId } from "./user-data.js";
import { initReveal } from "./reveal.js";
import { SOCIAL_PLATFORMS, BACKGROUND_PRESETS, BIO_MAX_LENGTH, resolveBackgroundValue } from "./profile-presets.js";
import { applyUserTheme } from "./user-theme.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function lockIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
}
function logoutIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`;
}
function starIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/></svg>`;
}
function emptyIcon() {
  return `<svg class="wl-empty-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/></svg>`;
}
function eyeIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
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

function gateHTML() {
  return `
  <div class="empty-state notfound-state">
    <div class="notfound-icon">${lockIcon()}</div>
    <h2>Anmeldung erforderlich</h2>
    <p>Melde dich an, um dein Konto zu sehen.</p>
    <button type="button" class="p-btn rip btn-accent" id="account-login-btn">Anmelden</button>
  </div>`;
}

function editIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
}
function checkIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
}

function profileHTML(user) {
  const name = user.displayName || user.email?.split("@")[0] || "Account";
  const prefs = parseAvatarPrefs(user);
  const style = prefs.ring ? `background:${prefs.color};--avatar-ring:${prefs.ring}` : `background:${prefs.color}`;
  return `
  <div class="account-avatar-lg ${avatarShapeClass(user)}" id="account-avatar-lg" style="${style}">${avatarContentHTML(user, 34)}${avatarBadgeHTML(user)}</div>
  <div class="account-info">
    <form class="account-name-form" id="account-name-form">
      <label for="account-name-input">Username</label>
      <div class="account-name-row">
        <input type="text" id="account-name-input" value="${escapeHTML(name)}" maxlength="24" required autocomplete="nickname">
        <button type="submit" class="p-btn rip btn-accent">Speichern</button>
      </div>
      <p class="auth-error" id="account-name-error"></p>
      <p class="account-name-saved" id="account-name-saved">Gespeichert.</p>
    </form>
    <p class="account-email">${escapeHTML(user.email || "")}</p>
    <div class="account-info-actions">
      <button type="button" class="account-avatar-edit-btn" id="account-avatar-edit-btn">${editIcon()}Avatar anpassen</button>
      <a class="account-avatar-edit-btn" href="/user/${encodeURIComponent(name)}/" target="_blank" rel="noopener">${eyeIcon()}Öffentliches Profil ansehen</a>
    </div>
  </div>
  <button type="button" class="account-logout" id="account-logout-btn" aria-label="Abmelden" title="Abmelden">${logoutIcon()}</button>`;
}

// ---------- Avatar "Baukasten" editor (shape + colors + icon + accessory) ----------
// Every pick applies immediately (same instant-save pattern this picker
// already had for color/icon, just extended to the 4 new axes) rather than
// staging a draft behind a separate "Speichern" -- simpler, and matches how
// every other click here has always behaved. All 6 fields round-trip through
// the Auth profile's own photoURL as plain text (see auth.js's
// updateAvatarPrefs) -- zero Firebase Storage, zero extra Firestore reads.
function avatarEditorPreviewHTML(user) {
  const prefs = parseAvatarPrefs(user);
  const style = prefs.ring ? `background:${prefs.color};--avatar-ring:${prefs.ring}` : `background:${prefs.color}`;
  return `
  <div class="avatar-editor-preview">
    <div class="account-avatar-lg ${avatarShapeClass(user)}" style="${style}">${avatarContentHTML(user, 34)}${avatarBadgeHTML(user)}</div>
  </div>`;
}

function avatarPickerHTML(user) {
  const prefs = parseAvatarPrefs(user);

  const shapeButtons = Object.entries(AVATAR_SHAPES)
    .map(
      ([key, s]) =>
        `<button type="button" class="account-shape-choice avatar-shape-${key}${prefs.shape === key ? " is-active" : ""}" data-shape="${key}" aria-label="${escapeHTML(s.label)}" title="${escapeHTML(s.label)}"></button>`
    )
    .join("");

  const swatches = AVATAR_COLORS.map(
    (c) => `<button type="button" class="account-swatch${c === prefs.color ? " is-active" : ""}" data-color="${c}" style="background:${c}" aria-label="Farbe ${c}">${c === prefs.color ? checkIcon() : ""}</button>`
  ).join("");

  const iconBtn = (key, svgInner, active) =>
    `<button type="button" class="account-icon-choice${active ? " is-active" : ""}" data-icon="${key}" aria-label="${key}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${svgInner}</svg></button>`;
  const letterBtn = `<button type="button" class="account-icon-choice${!prefs.icon ? " is-active" : ""}" data-icon="" aria-label="Buchstabe">${escapeHTML((user.displayName || user.email || "?").trim().charAt(0).toUpperCase())}</button>`;
  const iconButtons = letterBtn + Object.entries(AVATAR_ICONS).map(([key, svg]) => iconBtn(key, svg, prefs.icon === key)).join("");

  // "" (empty data-icon-color) means "no override" -- the icon just inherits
  // the wrapper's own white text color, same default as before this field
  // existed, so it's kept as a real reset option rather than a 27th color.
  const iconColorOptions = ["", "#1a1a1a", ...AVATAR_COLORS];
  const iconColorSwatches = iconColorOptions
    .map((c) => {
      const active = c ? prefs.iconColor === c : !prefs.iconColor;
      return `<button type="button" class="account-swatch account-swatch--sm${active ? " is-active" : ""}" data-icon-color="${c}" style="background:${c || "#ffffff"}" aria-label="Symbolfarbe ${c || "Weiß"}">${active ? checkIcon() : ""}</button>`;
    })
    .join("");

  const ringOptions = ["", "#ffffff", ...AVATAR_COLORS];
  const ringSwatches = ringOptions
    .map((c) => {
      const active = c ? prefs.ring === c : !prefs.ring;
      if (!c) return `<button type="button" class="account-swatch account-swatch--sm account-swatch--none${active ? " is-active" : ""}" data-ring="" aria-label="Kein Rahmen"></button>`;
      return `<button type="button" class="account-swatch account-swatch--sm${active ? " is-active" : ""}" data-ring="${c}" style="background:${c}" aria-label="Rahmenfarbe ${c}">${active ? checkIcon() : ""}</button>`;
    })
    .join("");

  const accessoryButtons =
    `<button type="button" class="account-accessory-choice${!prefs.accessory ? " is-active" : ""}" data-accessory="" aria-label="Kein Abzeichen">Keins</button>` +
    Object.entries(AVATAR_ACCESSORIES)
      .map(
        ([key, def]) => `
      <button type="button" class="account-accessory-choice${prefs.accessory === key ? " is-active" : ""}" data-accessory="${key}" aria-label="${escapeHTML(def.label)}" title="${escapeHTML(def.label)}">
        <span class="account-accessory-swatch" style="background:${def.color}"><svg viewBox="0 0 24 24" width="13" height="13" fill="#fff" stroke="none">${def.icon}</svg></span>
      </button>`
      )
      .join("");

  return `
  <p class="account-picker-label">Form</p>
  <div class="account-shape-row">${shapeButtons}</div>

  <p class="account-picker-label">Hintergrundfarbe</p>
  <div class="account-swatch-row">
    ${swatches}
    <label class="account-custom-color" title="Eigene Farbe">
      <input type="color" id="account-avatar-custom-color" value="${prefs.color}">
    </label>
  </div>

  <p class="account-picker-label">Symbol</p>
  <div class="account-icon-row">${iconButtons}</div>

  <p class="account-picker-label">Symbolfarbe</p>
  <div class="account-swatch-row account-swatch-row--sm">${iconColorSwatches}</div>

  <p class="account-picker-label">Rahmenfarbe</p>
  <div class="account-swatch-row account-swatch-row--sm">${ringSwatches}</div>

  <p class="account-picker-label">Abzeichen</p>
  <div class="account-accessory-row">${accessoryButtons}</div>`;
}

// ---------- Profile customization (bio + social buttons + background) ----------
// Lives on the public profiles/{uid} doc (see auth.js's updateProfileCustomization),
// not the Firebase Auth user object, so it needs its own read here -- avatar/
// name above come for free from auth.currentUser, this doesn't.
let currentBackground = "";

function socialRowHTML(key, platform, value) {
  const iconAttrs = platform.fill
    ? `fill="currentColor" stroke="none"`
    : `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  return `
  <div class="account-social-row">
    <span class="account-social-icon" style="color:${platform.color}"><svg viewBox="0 0 24 24" width="18" height="18" ${iconAttrs} aria-hidden="true">${platform.icon}</svg></span>
    <input type="text" data-social-key="${key}" value="${escapeHTML(value || "")}" placeholder="${escapeHTML(platform.placeholder)}" aria-label="${escapeHTML(platform.label)}">
  </div>`;
}

function backgroundSwatchHTML(key, label, styleValue, active) {
  return `<button type="button" class="account-bg-swatch${active ? " is-active" : ""}" data-bg="${key}" style="background:${styleValue}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${active ? checkIcon() : ""}</button>`;
}

function customizeHTML(user, profile) {
  const bio = profile?.bio || "";
  const socials = profile?.socials || {};
  const background = profile?.background || "";
  // A custom pick (raw #rrggbb from the color wheel below) never matches a
  // preset key, so none of the fixed swatches light up for it -- that's
  // correct, but the custom-color swatch itself still needs to visibly
  // reflect it rather than sitting there as a blank, unexplained circle.
  const customActive = !BACKGROUND_PRESETS[background] && !!background;
  const name = user.displayName || user.email?.split("@")[0] || "Account";
  const socialRows = Object.entries(SOCIAL_PLATFORMS).map(([key, p]) => socialRowHTML(key, p, socials[key])).join("");
  const bgSwatches =
    backgroundSwatchHTML("", "Standard", "var(--blue-mat)", !background) +
    Object.entries(BACKGROUND_PRESETS).map(([key, p]) => backgroundSwatchHTML(key, p.label, p.value, background === key)).join("");
  return `
  <h2 class="yt-section-title" style="margin-top:0;">Profil anpassen</h2>
  <p class="account-customize-hint">So sehen andere dein <a href="/user/${encodeURIComponent(name)}/" target="_blank" rel="noopener">öffentliches Profil</a> — eine eigene Seite mit Bio, Links und Hintergrund, wie ein Linktree.</p>
  <form id="account-customize-form">
    <label for="account-bio-input">Bio</label>
    <textarea id="account-bio-input" maxlength="${BIO_MAX_LENGTH}" placeholder="Erzähl etwas über dich...">${escapeHTML(bio)}</textarea>
    <p class="account-bio-counter" id="account-bio-counter">${bio.length} / ${BIO_MAX_LENGTH}</p>

    <p class="account-picker-label">Links</p>
    <div class="account-social-grid">${socialRows}</div>

    <p class="account-picker-label">Hintergrund</p>
    <p class="account-customize-hint">Färbt nicht nur dein Profil ein — solange du angemeldet bist, sieht die ganze Website für dich so aus (Home, Shop, überall).</p>
    <div class="account-bg-row" id="account-bg-row">
      ${bgSwatches}
      <label class="account-custom-color account-bg-swatch${customActive ? " is-active" : ""}" title="Eigene Farbe" style="${customActive ? `background:${background}` : ""}">
        <input type="color" id="account-bg-custom-color" value="${customActive ? background : "#234d70"}">
        ${customActive ? checkIcon() : ""}
      </label>
    </div>

    <p class="auth-error" id="account-customize-error"></p>
    <p class="account-name-saved" id="account-customize-saved">Gespeichert.</p>
    <button type="submit" class="p-btn rip btn-accent">Speichern</button>
  </form>`;
}

// Re-derives every swatch's active/checkmark state from currentBackground
// rather than the previous "clear every .account-bg-swatch's innerHTML,
// then fill in the clicked one" approach -- that used to also wipe the
// custom-color label's innerHTML on every click, which would have deleted
// the real <input type="color"> living inside it (not just a checkmark).
function refreshBgActiveStates() {
  const isCustom = !!currentBackground && !BACKGROUND_PRESETS[currentBackground];
  document.querySelectorAll("#account-bg-row .account-bg-swatch[data-bg]").forEach((b) => {
    const active = b.dataset.bg === currentBackground;
    b.classList.toggle("is-active", active);
    b.innerHTML = active ? checkIcon() : "";
  });
  const customLabel = document.querySelector("#account-bg-row .account-custom-color");
  if (!customLabel) return;
  customLabel.classList.toggle("is-active", isCustom);
  customLabel.style.background = isCustom ? currentBackground : "";
  customLabel.querySelector("svg")?.remove();
  if (isCustom) customLabel.insertAdjacentHTML("beforeend", checkIcon());
}

function wireCustomize(profile) {
  currentBackground = profile?.background || "";
  const form = document.getElementById("account-customize-form");
  if (!form) return;
  const bioInput = document.getElementById("account-bio-input");
  const counter = document.getElementById("account-bio-counter");
  bioInput?.addEventListener("input", () => {
    counter.textContent = `${bioInput.value.length} / ${BIO_MAX_LENGTH}`;
  });

  document.getElementById("account-bg-row")?.querySelectorAll(".account-bg-swatch[data-bg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentBackground = btn.dataset.bg;
      refreshBgActiveStates();
    });
  });
  // change (not input) -- same reasoning as the avatar editor's own custom
  // color picker: avoid writing/re-rendering on every drag tick.
  document.getElementById("account-bg-custom-color")?.addEventListener("change", (ev) => {
    currentBackground = ev.target.value;
    refreshBgActiveStates();
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errorEl = document.getElementById("account-customize-error");
    const savedEl = document.getElementById("account-customize-saved");
    const submitBtn = form.querySelector('button[type="submit"]');
    errorEl.textContent = "";
    savedEl.classList.remove("is-visible");
    const socials = {};
    form.querySelectorAll("[data-social-key]").forEach((input) => {
      socials[input.dataset.socialKey] = input.value;
    });
    submitBtn.disabled = true;
    try {
      await updateProfileCustomization(bioInput.value, socials, currentBackground);
      // Felt immediately, sitewide, on this same tab -- js/user-theme.js's
      // own background refresh only runs once per page LOAD, so without
      // this the visitor wouldn't see their own just-saved color change
      // until their next navigation.
      applyUserTheme(currentBackground);
      savedEl.classList.add("is-visible");
      setTimeout(() => savedEl.classList.remove("is-visible"), 2500);
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function loadCustomization(user) {
  const el = document.getElementById("account-customize");
  if (!el) return;
  try {
    const snap = await getDoc(doc(db, "profiles", user.uid));
    const profile = snap.exists() ? snap.data() : null;
    el.innerHTML = customizeHTML(user, profile);
    wireCustomize(profile);
  } catch (err) {
    console.error("Loading profile customization failed:", err);
    el.innerHTML = `<p class="comments-empty">Konnte nicht geladen werden.</p>`;
  }
}

function dangerHTML() {
  return `
  <div class="account-danger-box">
    <h2 class="yt-section-title" style="margin-top:0;">Konto löschen</h2>
    <p>Löscht dein Konto, deinen reservierten Username, deine Watchlist und alle deine Kommentare dauerhaft. Das kann nicht rückgängig gemacht werden.</p>
    <p class="auth-error" id="account-delete-error"></p>
    <button type="button" class="p-btn rip" id="account-delete-btn">Konto endgültig löschen</button>
  </div>`;
}

let byId = new Map();
let watchlistCache = new Set();

function wlCardHTML(video) {
  const source = video.source === "vod" ? null : `video:${video.id}`;
  const href = source ? `/video/${video.id}/` : video.url;
  const linkAttrs = source ? "" : ` target="_blank" rel="noopener"`;
  return `
  <a href="${href}"${linkAttrs} class="vod-card rip reveal" data-video-id="${video.id}">
    <div class="vod-thumb">
      <img src="${video.thumbnail}" alt="" loading="lazy">
      <button class="watchlist-toggle is-saved" data-watch-id="${video.id}" aria-label="Von der Watchlist entfernen" onclick="event.preventDefault()">${starIcon(true)}</button>
    </div>
    <h3>${escapeHTML(video.title)}</h3>
    <div class="vod-date">${formatDate(video.publishedAt)}</div>
  </a>`;
}

function renderWatchlist() {
  const grid = document.getElementById("account-wl-grid");
  const countEl = document.getElementById("account-wl-count");
  if (!grid) return;
  const ids = [...watchlistCache].reverse();
  const list = ids.map((id) => byId.get(id)).filter(Boolean);
  if (countEl) countEl.textContent = list.length ? `(${list.length})` : "";

  if (!list.length) {
    grid.innerHTML = `
    <div class="empty-state">
      ${emptyIcon()}
      <h2>Watchlist ist leer</h2>
      <p>Speicher Videos mit dem Stern auf den <a href="/vods/">VODs</a> oder <a href="/youtube/">YouTube</a> Seiten.</p>
    </div>`;
    return;
  }
  grid.innerHTML = list.map(wlCardHTML).join("") + `<a href="/watchlist/" class="account-wl-more rip">Ganze Watchlist ansehen &rarr;</a>`;
  grid.querySelectorAll("[data-watch-id]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      watchlistCache = await toggleWatchlistId(btn.dataset.watchId);
      renderWatchlist();
    });
  });
  initReveal(grid);
}

async function loadWatchlist() {
  const [vodFeed, mainFeed] = await Promise.all([
    loadJSON("/assets/data/videos.json", { videos: [] }),
    loadJSON("/assets/data/main-videos.json", { videos: [] }),
    getWatchlistIds().then((set) => (watchlistCache = set)),
  ]);
  byId = new Map();
  (vodFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: "vod" }));
  (mainFeed.videos || []).forEach((v) => byId.set(v.id, { ...v, source: v.isShort ? "short" : "youtube" }));
  renderWatchlist();
}

function wireProfile(user) {
  const form = document.getElementById("account-name-form");
  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = document.getElementById("account-name-input");
    const errorEl = document.getElementById("account-name-error");
    const savedEl = document.getElementById("account-name-saved");
    const submitBtn = form.querySelector('button[type="submit"]');
    errorEl.textContent = "";
    savedEl.classList.remove("is-visible");
    const value = input.value.trim();
    if (!value) {
      errorEl.textContent = "Bitte einen Username eingeben.";
      return;
    }
    submitBtn.disabled = true;
    try {
      await updateDisplayName(value);
      savedEl.classList.add("is-visible");
      setTimeout(() => savedEl.classList.remove("is-visible"), 2500);
      // Re-render the avatar letter/header slot too, in case the first
      // letter changed -- same "listener won't fire again for a profile-
      // field-only change" reasoning as auth-ui.js's own refreshAccountSlot.
      renderProfile(auth.currentUser);
      const { refreshAccountSlot } = await import("./auth-ui.js");
      refreshAccountSlot();
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("account-logout-btn")?.addEventListener("click", () => signOutUser());

  const picker = document.getElementById("account-avatar-picker");
  document.getElementById("account-avatar-edit-btn")?.addEventListener("click", () => {
    const open = picker.style.display !== "none";
    if (open) {
      picker.style.display = "none";
      return;
    }
    picker.innerHTML = avatarEditorPreviewHTML(user) + avatarPickerHTML(user);
    picker.style.display = "";
    wireAvatarPicker();
  });
}

// partial: any subset of {color, icon, shape, iconColor, accessory, ring} --
// merged onto the current prefs so e.g. picking a new icon doesn't clobber
// an already-chosen shape/ring/accessory.
async function applyAvatarPrefs(partial) {
  const current = parseAvatarPrefs(auth.currentUser);
  await updateAvatarPrefs({ ...current, ...partial });
  // #account-avatar-picker is a sibling of #account-profile, not one of its
  // children, so renderProfile() (which only replaces #account-profile's
  // own innerHTML) leaves the open panel alone -- just needs its own
  // preview/swatch/icon highlights refreshed to match the newly-applied pick.
  renderProfile(auth.currentUser);
  const picker = document.getElementById("account-avatar-picker");
  picker.innerHTML = avatarEditorPreviewHTML(auth.currentUser) + avatarPickerHTML(auth.currentUser);
  wireAvatarPicker(auth.currentUser);
  const { refreshAccountSlot } = await import("./auth-ui.js");
  refreshAccountSlot();
}

function wireAvatarPicker() {
  document.querySelectorAll("#account-avatar-picker .account-shape-choice").forEach((btn) => {
    btn.addEventListener("click", () => applyAvatarPrefs({ shape: btn.dataset.shape }));
  });
  document.querySelectorAll("#account-avatar-picker .account-swatch[data-color]").forEach((btn) => {
    btn.addEventListener("click", () => applyAvatarPrefs({ color: btn.dataset.color }));
  });
  // change (not input) -- input fires continuously while dragging the
  // native color wheel, which would otherwise write to Firestore on every
  // tick instead of once the visitor actually settles on a color.
  document.getElementById("account-avatar-custom-color")?.addEventListener("change", (ev) => applyAvatarPrefs({ color: ev.target.value }));
  document.querySelectorAll("#account-avatar-picker .account-icon-choice").forEach((btn) => {
    btn.addEventListener("click", () => applyAvatarPrefs({ icon: btn.dataset.icon || null }));
  });
  document.querySelectorAll("#account-avatar-picker [data-icon-color]").forEach((btn) => {
    btn.addEventListener("click", () => applyAvatarPrefs({ iconColor: btn.dataset.iconColor || null }));
  });
  document.querySelectorAll("#account-avatar-picker [data-ring]").forEach((btn) => {
    btn.addEventListener("click", () => applyAvatarPrefs({ ring: btn.dataset.ring || null }));
  });
  document.querySelectorAll("#account-avatar-picker .account-accessory-choice").forEach((btn) => {
    btn.addEventListener("click", () => applyAvatarPrefs({ accessory: btn.dataset.accessory || null }));
  });
}

function renderProfile(user) {
  const el = document.getElementById("account-profile");
  if (!el) return;
  el.innerHTML = profileHTML(user);
  wireProfile(user);
}

function wireDanger() {
  document.getElementById("account-delete-btn")?.addEventListener("click", async (ev) => {
    const errorEl = document.getElementById("account-delete-error");
    errorEl.textContent = "";
    if (!confirm("Konto wirklich unwiderruflich löschen?")) return;
    ev.target.disabled = true;
    try {
      await deleteAccount();
      location.href = "/";
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
      ev.target.disabled = false;
    }
  });
}

let loadedForUid = null;

onAuthChange((user) => {
  const gate = document.getElementById("account-gate");
  const app = document.getElementById("account-app");
  if (!user) {
    loadedForUid = null;
    app.style.display = "none";
    gate.innerHTML = gateHTML();
    gate.querySelector("#account-login-btn")?.addEventListener("click", async () => {
      const { openAuthModal } = await import("./auth-ui.js");
      openAuthModal();
    });
    return;
  }

  gate.innerHTML = "";
  app.style.display = "";
  renderProfile(user);
  document.getElementById("account-danger").innerHTML = dangerHTML();
  wireDanger();

  if (loadedForUid !== user.uid) {
    loadedForUid = user.uid;
    loadWatchlist();
    loadCustomization(user);
  }
});

// Covers signing up/in *while already sitting on this page* (via the shared
// modal) -- see auth-ui.js's refreshAccountSlot for why a fresh signup's
// displayName/avatar wouldn't otherwise show up here until a manual reload.
window.addEventListener("zevkev:profile-refresh", () => {
  if (auth.currentUser) renderProfile(auth.currentUser);
});
