// Public, read-only tokens only — Fourthwall's Storefront token is designed
// to be embedded in client-side code (product read + cart creation only).
// Real admin credentials must never go in a file like this.
export const FOURTHWALL_STOREFRONT_TOKEN = "ptkn_6c46cc3a-a035-40c9-a48a-2f828c860d9f";
export const TWITCH_CLIENT_ID = "rnvciectlc9kf9tb3utzuzvhrcdy2x";

// The static Twitch on/off switch lives in its own file so it's a one-line
// edit directly on GitHub — see js/twitch-toggle.js.
import { TWITCH_ENABLED as STATIC_TWITCH_ENABLED } from "./twitch-toggle.js";

// /privat/'s "Einstellungen" tab can override the static flag above at
// runtime (Firestore settings/site.twitchEnabled) without a redeploy --
// js/flags.js runs a background job that keeps this cache fresh for the
// *next* load (an explicit, accepted "not live on already-open tabs"
// tradeoff, same shape as the watchlist nav-item elsewhere). Read
// synchronously here via localStorage only (no Firebase import) so every
// existing consumer of TWITCH_ENABLED (this is the one file all of them
// import it from) picks up the override for free, with zero changes to
// live.js/vods.js/etc. themselves.
function cachedTwitchOverride() {
  try {
    const raw = localStorage.getItem("zevkev-twitch-enabled-cache");
    return raw === null ? null : raw === "1";
  } catch {
    return null;
  }
}
export const TWITCH_ENABLED = (() => {
  const override = cachedTwitchOverride();
  return override === null ? STATIC_TWITCH_ENABLED : override;
})();
