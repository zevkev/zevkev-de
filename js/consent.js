// Cookie consent for Google Analytics — GDPR requires tracking scripts to
// stay off until a visitor actively agrees, and to make declining just as
// easy as accepting. Nothing GA-related loads before consent is given.
import { GA_MEASUREMENT_ID } from "./ga-config.js";

const CONSENT_KEY = "zevkev-consent";
const isConfigured = GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-XXXXXXXXXX";

function getChoice() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}
function setChoice(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
}

// Google's own bootstrap snippet, verbatim in spirit: defines a stub gtag()
// synchronously so calls made before the real script finishes loading just
// queue into dataLayer instead of being lost, then injects the real script.
function loadGtag() {
  if (window.gtag) return; // already loaded (e.g. banner re-shown mid-session)
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

// Returning visitor who already said yes — bootstrap immediately, before
// mountConsentBanner() even runs, so this page's own page_view isn't missed.
if (isConfigured && getChoice() === "accepted") loadGtag();

function cookieIcon() {
  return `
  <svg class="consent-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2a9.96 9.96 0 0 0-7.07 2.93A9.96 9.96 0 0 0 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-.34-.02-.68-.05-1a3 3 0 0 1-3.95-3.95A10.02 10.02 0 0 0 12 2Z"/>
    <circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="13" cy="14" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9.5" cy="15.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/>
  </svg>`;
}

// Both buttons deliberately use the exact same plain .p-btn rip style (no
// .btn-accent highlight on Accept) -- an accepted-looking gold "Akzeptieren"
// next to a plain grey "Ablehnen" nudges the choice rather than presenting
// it neutrally, which is the kind of thing DPAs flag as a dark pattern.
// Kevin was explicit that the banner must let people decline just as
// easily as accept, so equal visual weight here isn't just styling.
// Revisiting via the footer's "Cookie-Einstellungen" link used to always
// show this exact same first-visit prompt, with no indication of what a
// returning visitor had already chosen -- someone checking "did I actually
// accept analytics?" had no way to tell short of opening dev tools. The
// status line below is plain text, not a styled/highlighted state on either
// button, so it stays purely informational rather than nudging the choice
// (see the comment on .consent-actions below for why that distinction
// matters here specifically).
function currentChoiceHTML(choice) {
  if (!choice) return "";
  const label = choice === "accepted" ? "Akzeptiert" : "Abgelehnt";
  return `<p class="consent-status">Aktuell: <strong>${label}</strong></p>`;
}

function bannerHTML(choice) {
  return `
  <div class="consent-banner rip rip--b" id="consent-banner" role="dialog" aria-label="Cookie-Einstellungen">
    <div class="tape"></div>
    <div class="consent-head">
      ${cookieIcon()}
      <h2>Cookies &amp; Datenschutz</h2>
    </div>
    <p>
      Wir nutzen Cookies für Google Analytics. Läuft nur mit deiner Zustimmung.
      Mehr Infos in den <a href="/datenschutz/#cookies">Cookie-Einstellungen</a>.
    </p>
    ${currentChoiceHTML(choice)}
    <div class="consent-actions">
      <button type="button" class="p-btn rip rip--pink" id="consent-decline">Ablehnen</button>
      <button type="button" class="p-btn rip rip--pink" id="consent-accept">Akzeptieren</button>
    </div>
  </div>`;
}

function hideBanner() {
  document.getElementById("consent-banner")?.remove();
}

function showBanner() {
  hideBanner();
  document.body.insertAdjacentHTML("beforeend", bannerHTML(getChoice()));
  document.getElementById("consent-accept")?.addEventListener("click", () => {
    setChoice("accepted");
    if (isConfigured) loadGtag();
    hideBanner();
  });
  document.getElementById("consent-decline")?.addEventListener("click", () => {
    setChoice("declined");
    hideBanner();
  });
}

export function mountConsentBanner() {
  if (getChoice()) return; // already decided, nothing to show
  showBanner();
}

// Lets a visitor change their mind later (wired to a "Cookie-Einstellungen"
// footer link in js/layout.js) — re-shows the banner regardless of any
// stored choice.
export function openConsentSettings() {
  showBanner();
}
