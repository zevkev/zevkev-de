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

function twitchIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`;
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
    ${
      profile.twitchUsername
        ? `<a class="p-btn rip profil-twitch-link" href="https://www.twitch.tv/${encodeURIComponent(profile.twitchUsername)}" target="_blank" rel="noopener">${twitchIcon()}Auf Twitch ansehen</a>`
        : ""
    }
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
