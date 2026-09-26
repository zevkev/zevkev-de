// Base URL of the MSPR Downloader API (see the separate
// MSPR-Downloader-API repo/project -- a small Node.js backend, since
// GitHub Pages itself can't run any server-side code). Isolated in its own
// file, same reasoning as js/twitch-toggle.js and js/ga-config.js: a plain
// one-line GitHub web-UI edit once the backend is deployed (e.g. to
// Render.com), no other code needs to change.
//
// Still the placeholder below until that deploy happens -- js/mspr.js
// checks for this exact value and shows a clear "not configured yet"
// message instead of trying (and failing) to reach a fake URL.
export const MSPR_API_BASE = "https://your-app-name.onrender.com";
