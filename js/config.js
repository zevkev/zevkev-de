// Public, read-only tokens only — Fourthwall's Storefront token is designed
// to be embedded in client-side code (product read + cart creation only).
// Real admin credentials must never go in a file like this.
export const FOURTHWALL_STOREFRONT_TOKEN = "";
export const TWITCH_CLIENT_ID = "rnvciectlc9kf9tb3utzuzvhrcdy2x";

// Master switch for every Twitch-related feature (live player, chat, OAuth
// login, "Auf Twitch folgen" buttons, the homepage Twitch section). Flip to
// false to keep the site fully functional (YouTube VODs still show) without
// mentioning Twitch anywhere, until you're ready to announce it. Set true
// for local testing.
export const TWITCH_ENABLED = true;
