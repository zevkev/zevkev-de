// "Login with Twitch" via the Implicit Grant flow — no client secret involved
// at any point, since a static site can't keep one safe. The token only ever
// lives in sessionStorage (cleared when the tab closes) and is used purely
// client-side to identify the visitor and send chat messages as them.
import { TWITCH_CLIENT_ID } from "./config.js";

const TOKEN_KEY = "zevkev-twitch-token";
const STATE_KEY = "zevkev-twitch-oauth-state";
const SCOPES = ["user:write:chat"];

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

export function startLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", TWITCH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  location.href = url.toString();
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
  } catch {
    return null;
  }
}

// Call once on every page load — picks up #access_token=... after the
// Twitch redirect, verifies state, stores it, and cleans the URL.
export function consumeRedirect() {
  if (!location.hash.includes("access_token")) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("access_token");
  const state = params.get("state");
  const expected = sessionStorage.getItem(STATE_KEY);
  history.replaceState(null, "", location.pathname + location.search);
  if (!token || !state || state !== expected) {
    console.warn("Twitch OAuth: missing/mismatched state, ignoring token.");
    return false;
  }
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: token }));
  sessionStorage.removeItem(STATE_KEY);
  return true;
}

async function helixFetch(path, token, opts = {}) {
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    ...opts,
    headers: {
      "Client-Id": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new Error("Twitch session expired, please log in again.");
  }
  if (!res.ok) throw new Error(`Twitch API ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

export async function getCurrentUser(token) {
  const { data } = await helixFetch("/users", token);
  return data?.[0] || null;
}

export async function resolveBroadcasterId(token, login) {
  const { data } = await helixFetch(`/users?login=${encodeURIComponent(login)}`, token);
  return data?.[0]?.id || null;
}

export async function sendChatMessage(token, broadcasterId, senderId, message) {
  return helixFetch("/chat/messages", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: senderId, message }),
  });
}
