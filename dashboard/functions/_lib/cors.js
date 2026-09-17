// CORS allowlist for /api/track, the only endpoint called cross-origin --
// the main site at https://zevkev.de POSTs tracking events here from
// privat.zevkev.de. Every other endpoint (login/logout/stats) is only
// ever called same-origin by this dashboard's own frontend, so it doesn't
// need CORS headers at all.
//
// Never reflect an arbitrary Origin back -- only echo one that matches
// this allowlist (the production site, or a localhost origin for local
// development).

const ALLOWED_ORIGIN = "https://zevkev.de";

function isLocalhostOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === "http:" || protocol === "https:") &&
      (hostname === "localhost" || hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

// Returns the CORS headers to attach to a response for this request. When
// there's no Origin header at all (same-origin request, curl, a server
// calling the API directly) there's nothing to allow-list and nothing to
// echo, so Access-Control-Allow-Origin is simply omitted -- browsers only
// enforce CORS for cross-origin requests in the first place.
export function corsHeaders(request) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const origin = request.headers.get("Origin");
  if (origin && (origin === ALLOWED_ORIGIN || isLocalhostOrigin(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    // Origin-dependent response -- tell caches not to mix up visitors.
    headers["Vary"] = "Origin";
  }
  return headers;
}
