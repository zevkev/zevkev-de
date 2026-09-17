// POST /api/track -- public, unauthenticated write endpoint for anonymous
// visitor analytics events. No auth on purpose: it only ever records an
// event type, a path/identifier string, and an optional numeric value.
// No IP address, no user agent, no cookie, nothing that identifies an
// individual visitor is ever read or stored here.
//
// Called cross-origin from the main site (https://zevkev.de), so this is
// also the one endpoint that needs CORS handling -- see ../_lib/cors.js.

import { corsHeaders } from "../_lib/cors.js";

const ALLOWED_TYPES = new Set([
  "page_view",
  "product_view",
  "add_to_cart",
  "click",
  "impression",
  "watch_time",
]);

// Defensive cap applied before anything touches SQL -- well above any
// realistic path/slug/label/video-id length, just to stop abuse.
const MAX_PATH_LENGTH = 300;

function jsonError(request, message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(request, "Invalid JSON body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(request, "Invalid JSON body", 400);
  }

  const { type, path, value } = body;

  if (typeof type !== "string" || !ALLOWED_TYPES.has(type)) {
    return jsonError(request, "Invalid or missing 'type'", 400);
  }

  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    return jsonError(request, "Invalid or missing 'path'", 400);
  }

  // value is optional -- absent/null is fine (most event types don't use
  // it). When present it must be a finite, non-negative safe integer
  // (watch-time seconds, add-to-cart quantity -- never negative or huge).
  let safeValue = null;
  if (value !== undefined && value !== null) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      return jsonError(request, "Invalid 'value'", 400);
    }
    safeValue = value;
  }

  const createdAt = Math.floor(Date.now() / 1000);

  try {
    await env.DB.prepare(
      "INSERT INTO events (type, path, value, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(type, path, safeValue, createdAt)
      .run();
  } catch {
    return jsonError(request, "Failed to record event", 500);
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

// CORS preflight -- browsers send this before the actual cross-origin
// POST from zevkev.de because the request has a JSON Content-Type.
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request),
  });
}
