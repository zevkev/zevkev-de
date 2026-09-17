// Shared session-cookie helpers for the dashboard's OWN login only.
//
// This has nothing to do with visitor tracking -- /api/track is
// unauthenticated and anonymous on purpose (see track.js). This module is
// only about the single site-operator logging into their own dashboard.
//
// Session token shape: `<base64url(payload)>.<base64url(hmac-sha256 sig)>`
// where payload is the JSON string `{"exp": <ms epoch>}`. Signed with
// env.SESSION_SECRET via the Web Crypto API (crypto.subtle), which is
// built into the Cloudflare Workers/Pages Functions runtime -- no Node
// crypto module, no external dependency needed.
//
// Underscore-prefixed paths (this whole `_lib/` directory) are NOT treated
// as routes by Cloudflare Pages Functions' file-based routing, so this
// file is safe to import from functions/api/*.js without becoming its own
// HTTP endpoint.

const COOKIE_NAME = "zevkev_dashboard_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url) {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payloadB64, secret) {
  const key = await hmacKey(secret);
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return toBase64Url(new Uint8Array(sigBytes));
}

// Constant-time-ish string comparison, used both for the signature check
// below and (imported directly) for the password check in login.js. Not a
// cryptographically rigorous timing-safe compare -- a proper library would
// do better -- but it avoids the most obvious short-circuit-on-first-
// mismatch timing leak, which is enough for a single-operator hobby
// dashboard rather than pulling in a crypto dependency for this alone.
export function timingSafeEqualStr(a, b) {
  const maxLen = Math.max(a.length, b.length);
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    result |= ca ^ cb;
  }
  return result === 0;
}

export async function createSessionToken(secret) {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const sig = await signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string" || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;

  let expectedSig;
  try {
    expectedSig = await signPayload(payloadB64, secret);
  } catch {
    return false;
  }
  if (!timingSafeEqualStr(sig, expectedSig)) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return false;
  }
  if (!payload || typeof payload.exp !== "number") return false;
  return Date.now() < payload.exp;
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// Convenience: read + verify the session cookie off a request in one call.
// Returns true/false -- callers just need to know "authenticated or not."
export async function getValidSession(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;
  return verifySessionToken(token, env.SESSION_SECRET);
}

export { COOKIE_NAME };
