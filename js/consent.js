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
  <svg class="h-7 w-7 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2a9.96 9.96 0 0 0-7.07 2.93A9.96 9.96 0 0 0 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-.34-.02-.68-.05-1a3 3 0 0 1-3.95-3.95A10.02 10.02 0 0 0 12 2Z"/>
    <circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="13" cy="14" r="1" fill="currentColor" stroke="none"/>
    <circle cx="9.5" cy="15.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/>
  </svg>`;
}

// Both buttons share the exact same style on purpose: highlighting
// "Akzeptieren" would nudge the choice (a dark pattern), and declining must
// be as easy as accepting. The status line is plain text for the same reason.
function currentChoiceHTML(choice) {
  if (!choice) return "";
  const label = choice === "accepted" ? "Akzeptiert" : "Abgelehnt";
  return `<p class="text-sm text-ink-muted">Aktuell: <strong class="text-ink">${label}</strong></p>`;
}

function bannerHTML(choice) {
  return `
  <div id="consent-banner" role="dialog" aria-label="Cookie-Einstellungen" aria-live="polite"
       class="paper paper-b fixed inset-x-3 bottom-3 z-[400] mx-auto flex max-w-xl flex-col gap-3.5 px-6 pb-6 pt-7 sm:bottom-5 sm:px-7">
    <div class="tape left-1/2 -translate-x-1/2 rotate-[-3deg]"></div>
    <div class="flex items-center gap-2.5">
      ${cookieIcon()}
      <h2 class="text-2xl">Cookies &amp; Datenschutz</h2>
    </div>
    <p class="leading-relaxed">
      Wir nutzen Cookies für Google Analytics. Läuft nur mit deiner Zustimmung.
      Mehr Infos in der <a class="link" href="/datenschutz/#cookies">Datenschutzerklärung</a>.
    </p>
    ${currentChoiceHTML(choice)}
    <div class="mt-1 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
      <button type="button" class="btn btn-pink" id="consent-decline">Ablehnen</button>
      <button type="button" class="btn btn-pink" id="consent-accept">Akzeptieren</button>
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
