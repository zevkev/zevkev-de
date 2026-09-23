// Dedicated login/register page (/login/?next=<path>) -- same form logic as
// js/auth-ui.js's modal, ported to a real page for better styling control
// on larger devices (see the header's logged-out button, which now points
// here instead of opening the modal). The modal itself stays in service
// for js/comments.js's inline "melde dich an" prompt and the account page's
// gate -- navigating away mid-comment would lose the draft, a real UX
// regression neither of those call sites asked for.
import { auth, onAuthChange, signUpWithEmail, signInWithEmail, signInWithGoogle, resetPassword, authErrorMessage } from "./auth.js";

function googleIcon() {
  return `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.3 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.5 26.7 36 24 36c-5.3 0-9.8-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.3 5.6-6.2 7.1l6.2 5.2C38.9 37 44 31 44 24c0-1.3-.1-2.5-.4-3.5z"/></svg>`;
}

function nextPath() {
  const raw = new URLSearchParams(location.search).get("next");
  // Only ever redirect to a path on this same site -- an open redirect
  // (e.g. ?next=https://evil.example) would otherwise let a crafted link
  // send someone here to log in and then bounce them straight to a
  // phishing page that looks like it "came from" a trusted login flow.
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account/";
}

let mode = "signin";

function setMode(next) {
  mode = next;
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === mode));
  document.getElementById("auth-username-field").style.display = mode === "signup" ? "block" : "none";
  document.getElementById("auth-password").setAttribute("autocomplete", mode === "signup" ? "new-password" : "current-password");
  document.getElementById("auth-submit").textContent = mode === "signup" ? "Registrieren" : "Anmelden";
  document.getElementById("auth-forgot").style.display = mode === "signup" ? "none" : "inline-block";
  document.getElementById("auth-error").textContent = "";
  document.getElementById("auth-success").textContent = "";
}

function wireForm() {
  document.querySelectorAll(".auth-tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

  document.getElementById("auth-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const errorEl = document.getElementById("auth-error");
    const submitBtn = document.getElementById("auth-submit");
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const username = document.getElementById("auth-username").value.trim();
    errorEl.textContent = "";
    document.getElementById("auth-success").textContent = "";
    if (mode === "signup" && !username) {
      errorEl.textContent = "Bitte einen Username eingeben.";
      return;
    }
    submitBtn.disabled = true;
    try {
      if (mode === "signup") await signUpWithEmail(username, email, password);
      else await signInWithEmail(email, password);
      location.href = nextPath();
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
      submitBtn.disabled = false;
    }
  });

  document.getElementById("auth-forgot").addEventListener("click", async () => {
    const errorEl = document.getElementById("auth-error");
    const successEl = document.getElementById("auth-success");
    const email = document.getElementById("auth-email").value.trim();
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

  document.getElementById("auth-google").addEventListener("click", async () => {
    const errorEl = document.getElementById("auth-error");
    errorEl.textContent = "";
    try {
      await signInWithGoogle();
      location.href = nextPath();
    } catch (err) {
      errorEl.textContent = authErrorMessage(err);
    }
  });
}

// Already signed in (e.g. followed an old bookmark, or clicked back after
// logging in elsewhere) -- just send them on instead of showing a form.
onAuthChange((user) => {
  if (user) location.href = nextPath();
});

wireForm();
document.getElementById("auth-email")?.focus();
