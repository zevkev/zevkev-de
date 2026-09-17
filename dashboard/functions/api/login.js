// POST /api/login -- single-operator password login for the dashboard
// itself (unrelated to visitor tracking, which stays fully anonymous and
// unauthenticated -- see track.js).
//
// Compares the submitted password against env.DASHBOARD_PASSWORD (a
// Cloudflare Pages secret, set via `wrangler pages secret put`, never
// committed to any file). On match, issues a signed session cookie (see
// ../_lib/auth.js). Not rate-limited on purpose: Cloudflare's platform-
// level protections plus a single low-traffic operator don't warrant the
// extra complexity here.

import { createSessionToken, sessionCookieHeader, timingSafeEqualStr } from "../_lib/auth.js";

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const password = body && typeof body.password === "string" ? body.password : "";

  if (!env.DASHBOARD_PASSWORD || !env.SESSION_SECRET) {
    // Secrets not configured yet -- fail closed with a generic message
    // rather than a confusing 500, this is a one-time setup step (see
    // dashboard/README.md) that just hasn't happened yet.
    return jsonError("Dashboard ist noch nicht eingerichtet", 401);
  }

  if (!password || !timingSafeEqualStr(password, env.DASHBOARD_PASSWORD)) {
    return jsonError("Falsches Passwort", 401);
  }

  const token = await createSessionToken(env.SESSION_SECRET);

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
}
