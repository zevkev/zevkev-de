// Base URL of the MSPR Downloader API (see the separate
// MSPR-Downloader-API repo/project -- a small Node.js backend, since
// GitHub Pages itself can't run any server-side code). Isolated in its own
// file, same reasoning as js/twitch-toggle.js and js/ga-config.js: a plain
// one-line GitHub web-UI edit once the backend is deployed (e.g. to
// Render.com), no other code needs to change.
//
// Deployed on Render.com's free Web Service tier, 2026-09-26. Confirmed
// live via a direct /api/health check before this was wired in.
export const MSPR_API_BASE = "https://mspr-downloader-api.onrender.com";
