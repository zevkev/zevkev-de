// Login/signup modal + the header's logged-in/out state. Reuses the site's
// existing .cart-backdrop/.qv-panel/.qv-close modal chrome (same pattern as
// the YouTube/Twitch video modals) rather than inventing a new one.
import { auth, onAuthChange, signUpWithEmail, signInWithEmail, signInWithGoogle, signOutUser, resetPassword, authErrorMessage, parseAvatarPrefs, avatarContentHTML, avatarShapeClass } from "./auth.js";

function personIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`;
}
function googleIcon() {
  return `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.3 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.5 26.7 36 24 36c-5.3 0-9.8-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.3 5.6-6.2 7.1l6.2 5.2C38.9 37 44 31 44 24c0-1.3-.1-2.5-.4-3.5z"/></svg>`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function accountSlotHTML(user) {
  if (!user) {
    // Points at the dedicated /login/ page (better styling control on
    // larger devices than the modal, per the explicit ask) rather than
    // opening the modal -- the modal itself stays in service only for
    // js/comments.js's inline prompt and the account page's own gate,
    // where navigating away would lose context (a draft comment, or just
    // be a pointless extra hop since /account/ already shows a gate).
    const next = encodeURIComponent(location.pathname + location.search);
    return `<a class="account-button" href="/login/?next=${next}" aria-label="Anmelden">${personIcon()}</a>`;
  }
  const name = user.displayName || user.email?.split("@")[0] || "Account";
  return `<a class="account-avatar ${avatarShapeClass(user)}" href="/account/" style="background:${parseAvatarPrefs(user).color}" aria-label="Mein Konto (${escapeHTML(name)})" title="${escapeHTML(name)}">${avatarContentHTML(user, 18)}</a>`;
}

// The persistent header-actions bar (#account-slot above) is already
// visible on every viewport without opening the hamburger menu, but the
// collapsed drawer itself carried no login-state cue at all -- this is
// the explicit "auch im Hamburger-Menü sehen" ask, a small addition
// alongside that bar rather than a replacement for it.
function navAccountSlotHTML(user) {
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return `<a href="/login/?next=${next}" class="nav-account-line">Anmelden</a>`;
  }
  const name = user.displayName || user.email?.split("@")[0] || "Account";
  return `
  <a href="/account/" class="nav-account-line">
    <span class="nav-account-avatar ${avatarShapeClass(user)}" style="background:${parseAvatarPrefs(user).color}">${avatarContentHTML(user, 14)}</span>
    Angemeldet als ${escapeHTML(name)}
  </a>
  <button type="button" class="nav-account-logout" id="nav-account-logout">Abmelden</button>`;
}

function modalHTML() {
  return `
  <div class="cart-backdrop is-open" id="auth-modal">
    <div class="qv-panel rip auth-panel">
      <button class="cart-close qv-close" id="auth-close" aria-label="Schließen" type="button">&times;</button>
      <div class="auth-tabs">
        <button type="button" class="auth-tab is-active" data-mode="signin">Anmelden</button>
        <button type="button" class="auth-tab" data-mode="signup">Registrieren</button>
      </div>
      <form id="auth-form" novalidate>
        <div class="auth-field" id="auth-username-field" style="display:none;">
          <label for="auth-username">Username</label>
          <input type="text" id="auth-username" autocomplete="nickname">
        </div>
        <div class="auth-field">
          <label for="auth-email">E-Mail</label>
          <input type="email" id="auth-email" required autocomplete="email">
        </div>
        <div class="auth-field">
          <label for="auth-password">Passwort</label>
          <input type="password" id="auth-password" required autocomplete="current-password" minlength="6">
        </div>
        <button type="button" class="auth-forgot-link" id="auth-forgot">Passwort vergessen?</button>
        <p class="auth-error" id="auth-error"></p>
        <p class="auth-success" id="auth-success"></p>
        <button type="submit" class="p-btn rip btn-accent auth-submit" id="auth-submit">Anmelden</button>
      </form>
      <div class="auth-divider"><span>oder</span></div>
      <button type="button" class="p-btn rip auth-google" id="auth-google">${googleIcon()}Mit Google anmelden</button>
    </div>
  </div>`;
}

let mode = "signin";

function onEscape(ev) {
  if (ev.key === "Escape") closeModal();
}

function closeModal() {
  document.getElementById("auth-modal")?.remove();
  document.removeEventListener("keydown", onEscape);
}

function setMode(modal, next) {
  mode = next;
  modal.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === mode));
  modal.querySelector("#auth-username-field").style.display = mode === "signup" ? "block" : "none";
  modal.querySelector("#auth-password").setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
  modal.querySelector("#auth-submit").textContent = mode === "signup" ? "Registrieren" : "Anmelden";
  modal.querySelector("#auth-forgot").style.display = mode === "signup" ? "none" : "inline-block";
  modal.querySelector("#auth-error").textContent = "";
  modal.querySelector("#auth-success").textContent = "";
}

function wireModal() {
  const modal = document.getElementById("auth-modal");
  modal.querySelector("#auth-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeModal();
  });
  document.addEventListener("keydown", onEscape);
  modal.querySelectorAll(".auth-tab").forEach((t) => t.addEventListener("click", () => setMode(modal, t.dataset.mode)));

  modal.querySelector("#auth-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errorEl = modal.querySelector("#auth-error");
    const submitBtn = modal.querySelector("#auth-submit");
    const email = modal.querySelector("#auth-email").value.trim();
    const password = modal.querySelector("#auth-password").value;
    const username = modal.querySelector("#auth-username").value.trim();
    errorEl.textContent = "";
    modal.querySelector("#auth-success").textContent = "";
    if (mode === "signup" && !username) {
      errorEl.textContent = "Bitte einen Username eingeben.";
      return;
    }
    submitBtn.disabled = true;
    try {
      if (mode === "signup") {
        await signUpWithEmail(username, email, password);
        refreshAccountSlot();
      } else {
        await signInWithEmail(email, password);
      }
      closeModal();
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    } finally {
      submitBtn.disabled = false;
    }
  });

  modal.querySelector("#auth-forgot").addEventListener("click", async () => {
    const errorEl = modal.querySelector("#auth-error");
    const successEl = modal.querySelector("#auth-success");
    const email = modal.querySelector("#auth-email").value.trim();
    errorEl.textContent = "";
    successEl.textContent = "";
    if (!email) {
      errorEl.textContent = "Bitte zuerst deine E-Mail-Adresse oben eingeben.";
      return;
    }
    try {
      await resetPassword(email);
      successEl.textContent = "Falls ein Konto mit dieser E-Mail existiert, wurde eine E-Mail zum Zurücksetzen des Passworts verschickt.";
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    }
  });

  modal.querySelector("#auth-google").addEventListener("click", async () => {
    const errorEl = modal.querySelector("#auth-error");
    errorEl.textContent = "";
    try {
      await signInWithGoogle();
      refreshAccountSlot();
      closeModal();
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    }
  });
}

function openModal() {
  closeModal();
  document.body.insertAdjacentHTML("beforeend", modalHTML());
  mode = "signin";
  wireModal();
  document.getElementById("auth-email")?.focus();
}
// Exported for other modules (js/comments.js's "melde dich an" prompt) that
// need to open the same login modal without duplicating its markup/wiring.
export const openAuthModal = openModal;

function renderAccountSlot(user) {
  const slot = document.getElementById("account-slot");
  if (slot) slot.innerHTML = accountSlotHTML(user);

  const navSlot = document.getElementById("nav-account-slot");
  if (navSlot) {
    navSlot.innerHTML = navAccountSlotHTML(user);
    document.getElementById("nav-account-logout")?.addEventListener("click", () => signOutUser());
  }
}

// Mounted once per page load (see js/layout.js's mountLayout()) — keeps the
// header's login button/account avatar AND the hamburger drawer's own
// login-state line in sync with the real auth state, including the very
// first render (onAuthChange fires immediately with the current user, same
// contract as Firebase's own listener). #nav-account-slot is in every
// page's header (js/layout.js's headerHTML(), unconditional -- unlike
// #account-slot, which is only added on video/account pages), so this now
// mounts everywhere rather than early-returning on pages without it.
export function mountAccountUI() {
  if (!document.getElementById("account-slot") && !document.getElementById("nav-account-slot")) return;
  onAuthChange(renderAccountSlot);
}

// signUpWithEmail's updateProfile(displayName/photoURL) call (a brand-new
// Google sign-in's own photoURL seed, and account.js's own rename/avatar
// changes) all resolve *after* the auth state listener already fired once
// with the old/no displayName -- profile field changes don't retrigger it,
// so without this the header would keep showing the stale name/letter/
// avatar until the next full reload. Reads auth.currentUser directly
// instead of waiting on a listener event that will never come.
// Also dispatches a plain DOM event so *any* other currently-mounted page
// (account.js's own #account-profile render, the future profile/login
// pages) can react the same way without importing this module directly or
// account.js/auth-ui.js needing to know about each other -- exported
// mainly so callers that already have a reference can call it eagerly
// (no event-loop delay), the event covers everything else.
export function refreshAccountSlot() {
  renderAccountSlot(auth.currentUser);
  window.dispatchEvent(new CustomEvent("zevkev:profile-refresh"));
}
