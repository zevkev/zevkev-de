// GET /api/stats -- auth-gated aggregated analytics for the dashboard UI.
// Requires a valid signed session cookie (see ../_lib/auth.js). This is
// the only place visitor event data is ever read back out, and only by
// the site owner's own authenticated session.
//
// Accepts an optional ?range=24h|7d|30d|all query param (default 7d).

import { getValidSession } from "../_lib/auth.js";

const RANGE_SECONDS = {
  "24h": 60 * 60 * 24,
  "7d": 60 * 60 * 24 * 7,
  "30d": 60 * 60 * 24 * 30,
};

// "all" has no lower bound -- created_at (a Unix timestamp) is always
// >= 0, so using 0 as the cutoff is equivalent to "no filter" while
// keeping every query below the same simple shape.
function rangeCutoff(range) {
  if (range === "all") return 0;
  return Math.floor(Date.now() / 1000) - RANGE_SECONDS[range];
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rows(result) {
  return (result && result.results) || [];
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const authenticated = await getValidSession(request, env);
  if (!authenticated) {
    return jsonResponse({ error: "Nicht angemeldet" }, 401);
  }

  const url = new URL(request.url);
  const requestedRange = url.searchParams.get("range") || "7d";
  const range = ["24h", "7d", "30d", "all"].includes(requestedRange) ? requestedRange : "7d";
  const cutoff = rangeCutoff(range);

  const db = env.DB;

  const [
    totalPageViews,
    vodPageViews,
    youtubePageViews,
    productViews,
    addToCart,
    clicks,
    impressions,
    watchTime,
  ] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'page_view' AND created_at >= ?"
      )
      .bind(cutoff)
      .first(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'page_view' AND created_at >= ? AND path LIKE '/vods%'"
      )
      .bind(cutoff)
      .first(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'page_view' AND created_at >= ? AND path LIKE '/youtube%'"
      )
      .bind(cutoff)
      .first(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count FROM events
         WHERE type = 'product_view' AND created_at >= ?
         GROUP BY path ORDER BY count DESC`
      )
      .bind(cutoff)
      .all(),
    db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(value), 0) AS totalQuantity FROM events
         WHERE type = 'add_to_cart' AND created_at >= ?`
      )
      .bind(cutoff)
      .first(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count FROM events
         WHERE type = 'click' AND created_at >= ?
         GROUP BY path ORDER BY count DESC`
      )
      .bind(cutoff)
      .all(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count FROM events
         WHERE type = 'impression' AND created_at >= ?
         GROUP BY path ORDER BY count DESC`
      )
      .bind(cutoff)
      .all(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count, COALESCE(SUM(value), 0) AS totalSeconds,
                COALESCE(AVG(value), 0) AS avgSeconds
         FROM events
         WHERE type = 'watch_time' AND created_at >= ?
         GROUP BY path ORDER BY totalSeconds DESC`
      )
      .bind(cutoff)
      .all(),
  ]);

  return jsonResponse({
    range,
    pageViews: { total: totalPageViews?.count ?? 0 },
    vodPageViews: vodPageViews?.count ?? 0,
    youtubePageViews: youtubePageViews?.count ?? 0,
    productViews: rows(productViews).map((r) => ({ path: r.path, count: r.count })),
    addToCart: {
      count: addToCart?.count ?? 0,
      totalQuantity: addToCart?.totalQuantity ?? 0,
    },
    clicks: rows(clicks).map((r) => ({ path: r.path, count: r.count })),
    impressions: rows(impressions).map((r) => ({ path: r.path, count: r.count })),
    watchTime: rows(watchTime).map((r) => ({
      path: r.path,
      count: r.count,
      totalSeconds: r.totalSeconds,
      avgSeconds: Math.round(r.avgSeconds),
    })),
  });
}
