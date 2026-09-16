// Public, read-only tokens only — Fourthwall's Storefront token is designed
// to be embedded in client-side code (product read + cart creation only).
// Real admin credentials must never go in a file like this.
export const FOURTHWALL_STOREFRONT_TOKEN = "ptkn_6c46cc3a-a035-40c9-a48a-2f828c860d9f";
export const TWITCH_CLIENT_ID = "rnvciectlc9kf9tb3utzuzvhrcdy2x";

// The Twitch on/off switch lives in its own file so it's a one-line edit
// directly on GitHub — see js/twitch-toggle.js.
export { TWITCH_ENABLED } from "./twitch-toggle.js";
