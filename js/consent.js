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

function bannerHTML() {
  return `
  <div class="consent-banner rip rip--b" id="consent-banner" role="dialog" aria-label="Cookie-Einstellungen">
    <p>
      Wir nutzen Google Analytics, um zu sehen, wie die Seite genutzt wird (Seitenaufrufe, Klicks, Sehdauer bei Videos).
      Das läuft nur, wenn du zustimmst. Mehr dazu in der <a href="/datenschutz/">Datenschutzerklärung</a>.
    </p>
    <div class="consent-actions">
      <button type="button" class="p-btn rip" id="consent-decline">Ablehnen</button>
      <button type="button" class="p-btn rip btn-accent" id="consent-accept">Akzeptieren</button>
    </div>
  </div>`;
}

function hideBanner() {
  document.getElementById("consent-banner")?.remove();
}

function showBanner() {
  hideBanner();
  document.body.insertAdjacentHTML("beforeend", bannerHTML());
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
