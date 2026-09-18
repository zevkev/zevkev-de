// Runs first, before anything else touches the DOM: flips <html> into
// twitch-disabled mode when the feature flag is off, so CSS can hide every
// [data-twitch-only] element in one place. Keep this tiny and dependency-
// free so it resolves as fast as possible -- TWITCH_ENABLED itself (and the
// localStorage-cache override /privat/'s "Einstellungen" tab can set) lives
// in js/config.js, since every other consumer (live.js, vods.js) already
// imports it from there and this way they all see the same value for free.
import { TWITCH_ENABLED } from "./config.js";

export { TWITCH_ENABLED };

if (!TWITCH_ENABLED) {
  document.documentElement.classList.add("twitch-disabled");
}

// Background refresh of that cache for the *next* load -- dynamic imports
// so this stays non-blocking and doesn't turn this file into a hard
// Firebase dependency. Every page already loads Firebase somewhere (the
// header login chip alone guarantees it), so this is very often just
// reusing an SDK fetch already in flight, not triggering a new one.
import("./auth.js")
  .then(async ({ db }) => {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists() && typeof snap.data().twitchEnabled === "boolean") {
      try {
        localStorage.setItem("zevkev-twitch-enabled-cache", snap.data().twitchEnabled ? "1" : "0");
      } catch {
        // ignore -- private browsing / storage full, just skip caching
      }
    }
  })
  .catch(() => {});
