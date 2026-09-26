// Public profile page (/profil/?u=<username>) -- read-only, no auth needed.
// Resolves username -> uid via the existing usernames/{normalized} doc (the
// same collection js/auth.js's reserveUsername already maintains), then
// reads the public profiles/{uid} doc (see js/auth.js's syncPublicProfile)
// for the denormalized display fields. Two reads total, both one-shot, same
// "minimal Firestore reads" convention as the rest of the site.
import { db } from "./auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { SOCIAL_PLATFORMS, BACKGROUND_PRESETS, AVATAR_ICONS, AVATAR_SHAPES, AVATAR_ACCESSORIES } from "./profile-presets.js";

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

// Renders one link button per social handle the visitor actually set --
// nothing for platforms left empty, and silently drops any Firestore key
// that isn't a recognized platform (a stale/removed preset, or unexpected
// data) rather than rendering a broken button for it.
function socialButtonsHTML(socials) {
  const entries = Object.entries(socials || {}).filter(([key, value]) => value && SOCIAL_PLATFORMS[key]);
  if (!entries.length) return "";
  const buttons = entries
    .map(([key, value]) => {
      const platform = SOCIAL_PLATFORMS[key];
      const url = platform.urlFor(String(value));
      const iconAttrs = platform.fill
        ? `fill="currentColor" stroke="none"`
        : `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
      return `
      <a class="profil-link-btn rip" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" style="--btn-color:${platform.color}">
        <span class="profil-link-icon"><svg viewBox="0 0 24 24" width="20" height="20" ${iconAttrs} aria-hidden="true">${platform.icon}</svg></span>
        <span class="profil-link-label">${escapeHTML(platform.label)}</span>
      </a>`;
    })
    .join("");
  return `<div class="profil-links">${buttons}</div>`;
}

// Small accessory badge overlay -- exact same markup/behavior as
// js/auth.js's own avatarBadgeHTML (that function isn't imported here since
// it takes a live Auth `user` object, not a plain profiles/{uid} data
// object; the two are kept in sync by hand -- both are one-liners reading
// the same AVATAR_ACCESSORIES map).
function avatarBadgeHTML(profile) {
  const def = profile.avatarAccessory && AVATAR_ACCESSORIES[profile.avatarAccessory];
  if (!def) return "";
  return `<span class="avatar-badge" style="background:${def.color}" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="#fff" stroke="none">${def.icon}</svg></span>`;
}

function profileHTML(username, profile) {
  const name = profile.displayName || username;
  const color = profile.avatarColor || "#4a7c9e";
  const icon = profile.avatarIcon;
  const iconStyle = profile.avatarIconColor ? ` style="color:${profile.avatarIconColor}"` : "";
  const content =
    icon && AVATAR_ICONS[icon]
      ? `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"${iconStyle}>${AVATAR_ICONS[icon]}</svg>`
      : escapeHTML((name || "?").trim().charAt(0).toUpperCase() || "?");
  const shapeClass = `avatar-shape-${profile.avatarShape && AVATAR_SHAPES[profile.avatarShape] ? profile.avatarShape : "circle"}`;
  const avatarStyle = profile.avatarRing ? `background:${color};--avatar-ring:${profile.avatarRing}` : `background:${color}`;
  const bio = String(profile.bio || "").trim();
  return `
  <div class="profil-card rip rip--b">
    <div class="tape"></div>
    <div class="profil-avatar ${shapeClass}" style="${avatarStyle}">${content}${avatarBadgeHTML(profile)}</div>
    <h1>${escapeHTML(name)}</h1>
    ${bio ? `<p class="profil-bio">${escapeHTML(bio)}</p>` : ""}
    ${socialButtonsHTML(profile.socials)}
  </div>`;
}

// AVATAR_ICONS/AVATAR_SHAPES/AVATAR_ACCESSORIES now live in
// profile-presets.js (imported above), which has zero Firebase dependency
// of its own -- this page used to duplicate its own copy of the icon map
// specifically to avoid pulling in the whole (Firebase-initializing)
// js/auth.js module just for icon paths. That reasoning no longer applies
// now that the data has its own dependency-free home, so the duplicate
// (and the risk of the two copies drifting out of sync) is gone.

// Prefer the query string when present so the original /profil/?u=<name>
// links (already shared/bookmarked before /user/<name>/ existed) keep
// working unchanged -- same reasoning, and same pattern, as js/product.js's
// own getSlugFromLocation().
function getUsernameFromLocation() {
  const qsUser = new URLSearchParams(window.location.search).get("u");
  if (qsUser) return qsUser;
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "user") {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

// Recolors the site's own cutting-mat background for just this page load,
// leaving every grid/texture layer already painted on top of it (see
// body's own background-image stack in style.css) untouched -- overriding
// the --blue-mat custom property those layers are drawn over, rather than
// replacing body's background outright, is what keeps them working. Falls
// back to doing nothing (the page's normal default mat) for an unset or
// unrecognized/legacy preset key, so a preset removed later can't strand
// an existing profile on a blank background.
function applyBackground(key) {
  const preset = key && BACKGROUND_PRESETS[key];
  if (preset) document.documentElement.style.setProperty("--blue-mat", preset.value);
}

async function init() {
  const root = document.getElementById("profil-root");
  if (!root) return;
  const username = getUsernameFromLocation();
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
    const displayName = profile.displayName || username;
    document.title = `${displayName} | ZevKev`;
    const bio = String(profile.bio || "").trim();
    const desc = document.querySelector('meta[name="description"]');
    if (desc && bio) desc.setAttribute("content", bio);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", `${displayName} | ZevKev`);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && bio) ogDesc.setAttribute("content", bio);
    // Point the share URL at the clean /user/<name>/ form regardless of
    // whether this actually loaded via that path or the older /profil/?u=
    // one -- same reasoning/pattern as js/product.js's own canonicalUrl.
    const canonicalUrl = `https://zevkev.de/user/${encodeURIComponent(username)}/`;
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    applyBackground(profile.background);
    root.innerHTML = profileHTML(username, profile);
  } catch (err) {
    console.error("Loading profile failed:", err);
    root.innerHTML = notFoundHTML();
  }
}

init();
