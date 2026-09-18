// Public profile page (/profil/?u=<username>) -- read-only, no auth needed.
// Resolves username -> uid via the existing usernames/{normalized} doc (the
// same collection js/auth.js's reserveUsername already maintains), then
// reads the public profiles/{uid} doc (see js/auth.js's syncPublicProfile)
// for the denormalized display fields. Two reads total, both one-shot, same
// "minimal Firestore reads" convention as the rest of the site.
import { db } from "./auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function notFoundHTML() {
  return `
  <div class="empty-state notfound-state">
    <div class="notfound-icon">
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/><path d="M4 4l16 16"/></svg>
    </div>
    <h2>Profil nicht gefunden</h2>
    <p>Diesen Nutzer gibt es nicht (mehr).</p>
    <a href="/" class="p-btn rip btn-accent">Zur Startseite</a>
  </div>`;
}

function profileHTML(username, profile) {
  const name = profile.displayName || username;
  const color = profile.avatarColor || "#4a7c9e";
  const icon = profile.avatarIcon;
  const content = icon
    ? `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${AVATAR_ICON_SVGS[icon] || ""}</svg>`
    : escapeHTML((name || "?").trim().charAt(0).toUpperCase() || "?");
  return `
  <div class="profil-card rip">
    <div class="profil-avatar" style="background:${color}">${content}</div>
    <h1>${escapeHTML(name)}</h1>
  </div>`;
}

// Duplicated (not imported) from js/auth.js's AVATAR_ICONS on purpose --
// that module initializes Firebase Auth on load, which this read-only,
// no-login-needed page has no other reason to pull in. Keep in sync if
// icons are added/changed there.
const AVATAR_ICON_SVGS = {
  star: '<path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-6.5-4.2-9-8.2C1 8.4 2.5 5 6 5c2 0 3.5 1.1 4.5 2.6C11.5 6.1 13 5 15 5c3.5 0 5 3.4 3 6.8-2.5 4-9 8.2-9 8.2z" stroke-linejoin="round"/>',
  ghost: '<path d="M12 3c-4 0-7 3-7 7v9l2.5-2 2 2 2.5-2 2.5 2 2-2 2.5 2v-9c0-4-3-7-7-7z" stroke-linejoin="round"/><circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5"/><path d="M12 13v4M9 20h6M10 17h4"/>',
  flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-1-2-1-2 1 0 3 2 3 5a5 5 0 0 1-10 0c0-5 3-6 5-11z" stroke-linejoin="round"/>',
  controller: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M19 13h.01"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2" y="13" width="4" height="6" rx="1.5"/><rect x="18" y="13" width="4" height="6" rx="1.5"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5"/>',
  ferris: '<circle cx="12" cy="13" r="7.5"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M12 5.5v7.5M12 13l6.5-3.8M12 13l-6.5-3.8M12 13l6.5 3.8M12 13l-6.5 3.8M12 13v7.5"/><circle cx="12" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="9.2" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="16.8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="20.5" r="1" fill="currentColor" stroke="none"/><circle cx="5.5" cy="16.8" r="1" fill="currentColor" stroke="none"/><circle cx="5.5" cy="9.2" r="1" fill="currentColor" stroke="none"/>',
  coaster: '<path d="M2.5 17.5c1.5-6 3.5-10 5.5-10s2 5 4 5 2-9 4.5-9 2.5 12 3.5 14" stroke-linejoin="round"/><circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none"/>',
  ticket: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.3a1.4 1.4 0 0 0 0 2.8V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.9a1.4 1.4 0 0 0 0-2.8z" stroke-linejoin="round"/><path d="M14.5 6.5v9" stroke-dasharray="2 2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" stroke-linejoin="round"/>',
  alien: '<path d="M12 3c-4 0-6.5 4-6.5 8.5 0 5 2.7 9.5 6.5 9.5s6.5-4.5 6.5-9.5C18.5 7 16 3 12 3z" stroke-linejoin="round"/><ellipse cx="9" cy="11.5" rx="1.3" ry="2.2" fill="currentColor" stroke="none"/><ellipse cx="15" cy="11.5" rx="1.3" ry="2.2" fill="currentColor" stroke="none"/>',
  robot: '<rect x="5" y="8" width="14" height="12" rx="3"/><path d="M12 8V4M9 4h6"/><circle cx="9.5" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14" r="1.2" fill="currentColor" stroke="none"/><path d="M9 18h6" stroke-linecap="round"/>',
  grin: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M7.5 14c1 1.6 3 2.2 4.5 2.2s3.5-.6 4.5-2.2" stroke-linejoin="round"/><path d="M11 16.2c0 1.6.5 3 1.4 3s1-1.4.8-2.4" stroke-linejoin="round"/>',
  cat: '<path d="M6 9l1.7-4 3 3.2h2.6l3-3.2L18 9" stroke-linejoin="round"/><circle cx="12" cy="14" r="6"/><circle cx="9.3" cy="13.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="13.5" r="1" fill="currentColor" stroke="none"/><path d="M9.8 17c.9.8 3.5.8 4.4 0" stroke-linecap="round"/>',
  dog: '<path d="M5 8c-1.2-2 0-4.3 2.1-4.1s1.7 2.4.6 4.4M19 8c1.2-2 0-4.3-2.1-4.1s-1.7 2.4-.6 4.4" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="6"/><circle cx="9.5" cy="12.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12.5" r="1" fill="currentColor" stroke="none"/><path d="M10 16.5c.7.6 3.3.6 4 0" stroke-linecap="round"/>',
  crown: '<path d="M4 18h16l-1.3-7.5-4 3.2L12 8l-2.7 5.7-4-3.2z" stroke-linejoin="round"/><path d="M4 18h16" stroke-linecap="round"/>',
  rocket: '<path d="M12 2.5c3 2.3 4 6 4 9.5 0 2.2-1.1 4.3-4 6.3-2.9-2-4-4.1-4-6.3 0-3.5 1-7.2 4-9.5z" stroke-linejoin="round"/><circle cx="12" cy="10.5" r="1.5" fill="currentColor" stroke="none"/><path d="M8.5 15.5l-3 4.5M15.5 15.5l3 4.5M10.3 19.5l1.7 2 1.7-2" stroke-linecap="round" stroke-linejoin="round"/>',
  pizza: '<path d="M12 3 3 20h18z" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1" fill="currentColor" stroke="none"/>',
  anchor: '<path d="M12 6v16"/><path d="m19 13 2-1a9 9 0 0 1-18 0l2 1"/><path d="M9 11h6"/><circle cx="12" cy="4" r="2"/>',
  bird: '<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3"/><path d="M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/>',
  bomb: '<circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 2-1.5 1.5"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  dice: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
  fish: '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/><path d="m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"/>',
  gem: '<path d="M10.5 3 8 9l4 13 4-13-2.5-6"/><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"/><path d="M2 9h20"/>',
  gift: '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
  leaf: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
  medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
  moon: '<path d="M18 5h4"/><path d="M20 3v4"/><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  party: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>',
  popcorn: '<path d="M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4"/><path d="M10 22 9 8"/><path d="m14 22 1-14"/><path d="M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z"/>',
  rabbit: '<path d="M13 16a3 3 0 0 1 2.24 5"/><path d="M18 12h.01"/><path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/><path d="M20 8.54V4a2 2 0 1 0-4 0v3"/><path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  skull: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
  snowflake: '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  sword: '<path d="m11 19-6-6"/><path d="m5 21-2-2"/><path d="m8 16-4 4"/><path d="M9.5 17.5 20.414 6.586A2 2 0 0021 5.172V3h-2.172a2 2 0 00-1.414.586L6.5 14.5"/>',
  umbrella: '<path d="M12 13v7a2 2 0 0 0 4 0"/><path d="M12 2v2"/><path d="M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
};

async function init() {
  const root = document.getElementById("profil-root");
  if (!root) return;
  const username = new URLSearchParams(window.location.search).get("u");
  if (!username) {
    root.innerHTML = notFoundHTML();
    return;
  }
  try {
    const normalized = username.trim().toLowerCase();
    const nameSnap = await getDoc(doc(db, "usernames", normalized));
    if (!nameSnap.exists()) {
      root.innerHTML = notFoundHTML();
      return;
    }
    const uid = nameSnap.data().uid;
    const profileSnap = await getDoc(doc(db, "profiles", uid));
    if (!profileSnap.exists()) {
      root.innerHTML = notFoundHTML();
      return;
    }
    const profile = profileSnap.data();
    document.title = `${profile.displayName || username} | ZevKev`;
    root.innerHTML = profileHTML(username, profile);
  } catch (err) {
    console.error("Loading profile failed:", err);
    root.innerHTML = notFoundHTML();
  }
}

init();
