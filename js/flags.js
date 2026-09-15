// Runs first, before anything else touches the DOM: flips <html> into
// twitch-disabled mode when the feature flag is off, so CSS can hide every
// [data-twitch-only] element in one place. Keep this tiny and dependency-free
// so it resolves as fast as possible.
import { TWITCH_ENABLED } from "./config.js";

export { TWITCH_ENABLED };

if (!TWITCH_ENABLED) {
  document.documentElement.classList.add("twitch-disabled");
}
