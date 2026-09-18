// "Login with Twitch" via the Implicit Grant flow, opened in a small popup
// window instead of navigating the whole page away — no client secret
// involved at any point, since a static site can't keep one safe. The token
// only ever lives in sessionStorage (cleared when the tab closes) and is
// used purely client-side to identify the visitor and send chat messages.
import { TWITCH_CLIENT_ID } from "./config.js";

const TOKEN_KEY = "zevkev-twitch-token";
const STATE_KEY = "zevkev-twitch-oauth-state";
const SCOPES = ["user:write:chat"];

const changeListeners = new Set();
export function onAuthChange(cb) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}
function notifyChange() {
  changeListeners.forEach((cb) => cb());
}

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

function authUrl(state) {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", TWITCH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export function startLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const w = 480;
  const h = 720;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  const popup = window.open(
    authUrl(state),
    "twitch-login",
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
  if (!popup) {
    // Popup blocked — fall back to a normal same-tab redirect.
    location.href = authUrl(state);
  }
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  notifyChange();
}

export function getToken() {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
  } catch {
    return null;
  }
}

function storeToken(accessToken) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken }));
}

// Call once on every page load. Two cases:
// - We ARE the popup Twitch just redirected back to: hand the token to the
//   window that opened us via postMessage, then close ourselves.
// - We're a normal tab that received that message: store the token and
//   notify listeners so the UI (e.g. the chat login box) can update.
export function consumeRedirect() {
  if (window.opener && !window.opener.closed && location.hash.includes("access_token")) {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get("access_token");
    const state = params.get("state");
    try {
      window.opener.postMessage({ source: "zevkev-twitch-auth", accessToken: token, state }, location.origin);
    } catch {
      // ignore — opener may have navigated away
    }
    window.close();
    return false;
  }

  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin) return;
    const data = ev.data;
    if (!data || data.source !== "zevkev-twitch-auth") return;
    const expected = sessionStorage.getItem(STATE_KEY);
    if (!data.accessToken || !data.state || data.state !== expected) {
      console.warn("Twitch OAuth: missing/mismatched state, ignoring token.");
      return;
    }
    storeToken(data.accessToken);
    sessionStorage.removeItem(STATE_KEY);
    notifyChange();
  });

  // Legacy fallback: same-tab redirect landed here directly (popup blocked).
  if (location.hash.includes("access_token")) {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get("access_token");
    const state = params.get("state");
    const expected = sessionStorage.getItem(STATE_KEY);
    history.replaceState(null, "", location.pathname + location.search);
    if (token && state && state === expected) {
      storeToken(token);
      sessionStorage.removeItem(STATE_KEY);
      // Was missing here -- the token stored correctly (a real Twitch
      // session existed) but nothing was ever told about it, so any UI
      // relying on onAuthChange (js/account.js's "Twitch verbinden" button,
      // the Mehr/Live chat-login box) silently stayed on its logged-out
      // state forever, even though storeToken()/getToken() would have
      // returned a perfectly valid token the whole time. Only ever missed
      // when the popup path is actually blocked and this same-tab fallback
      // runs instead -- the far more common popup path already called this
      // correctly (see the message listener above).
      notifyChange();
      return true;
    }
  }
  return false;
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
