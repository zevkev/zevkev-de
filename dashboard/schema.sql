-- ZevKev private dashboard -- D1 schema.
--
-- One flat events table is enough for the metrics the dashboard needs:
-- page views (grouped by path -- this is also how VOD-page and
-- YouTube-page views are derived, since those are just page_view rows
-- whose path starts with /vods or /youtube), product quick-view opens,
-- and add-to-cart events. No personal data (no IP, no user agent) is
-- captured -- only event type, an identifier, and a timestamp.
--
-- Apply with:
--   wrangler d1 execute zevkev-privat-db --remote --file=./dashboard/schema.sql
-- (drop --remote to apply to the local dev database instead)

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 'page_view' | 'product_view' | 'add_to_cart' -- enforced by the API,
  -- not by a SQL CHECK constraint, so the allowlist only has to live in
  -- one place (functions/api/track.js).
  type TEXT NOT NULL,
  -- Page path for page_view (e.g. "/vods/"), product name for
  -- product_view, or variant id for add_to_cart. Always plain text,
  -- capped and sanitized before it ever reaches this table.
  path TEXT NOT NULL,
  -- Unix timestamp, seconds, UTC.
  created_at INTEGER NOT NULL
);

-- The dashboard's two query shapes: "events in the last N days" and
-- "counts grouped by type/path" -- these three indexes cover both.
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_type_created_at ON events (type, created_at);
