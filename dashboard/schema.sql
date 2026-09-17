-- ZevKev private dashboard -- D1 schema.
--
-- One flat events table is enough for the metrics the dashboard needs:
-- page views (grouped by path -- this is also how VOD-page and
-- YouTube-page views are derived, since those are just page_view rows
-- whose path starts with /vods or /youtube), product views, add-to-cart
-- events, generic clicks, impressions, and watch-time. No personal data
-- (no IP, no user agent, no cookies/identifiers tied to a visitor) is
-- captured -- only event type, an identifier, an optional numeric value,
-- and a timestamp.
--
-- Apply with:
--   wrangler d1 execute zevkev-privat-db --remote --file=./dashboard/schema.sql
-- (drop --remote to apply to the local dev database instead)
--
-- This is a fresh, never-deployed schema, so the table below is edited
-- directly rather than migrated with ALTER TABLE. If this schema is ever
-- changed again *after* a real deploy has real data in it, prefer:
--   ALTER TABLE events ADD COLUMN <new_col> <TYPE>;
-- (SQLite/D1 can't ALTER a column's type or drop columns easily, so
-- additive-only changes are the safe path once data exists.)

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 'page_view' | 'product_view' | 'add_to_cart' | 'click' | 'impression'
  -- | 'watch_time' -- enforced by the API, not by a SQL CHECK constraint,
  -- so the allowlist only has to live in one place (functions/api/track.js).
  type TEXT NOT NULL,
  -- Meaning depends on `type`:
  --   page_view     -> the page path, e.g. "/vods/" (also how VOD-page vs
  --                    YouTube-page views are derived: prefix match on
  --                    "/vods" / "/youtube")
  --   product_view  -> product slug
  --   add_to_cart   -> variant id
  --   click         -> the element's data-track-click label
  --   impression    -> video id
  --   watch_time    -> video id
  -- Always plain text, capped and sanitized before it ever reaches this
  -- table.
  path TEXT NOT NULL,
  -- Optional numeric payload, meaning depends on `type`:
  --   add_to_cart -> quantity added
  --   watch_time  -> seconds watched
  --   everything else -> NULL (not applicable)
  value INTEGER,
  -- Unix timestamp, seconds, UTC.
  created_at INTEGER NOT NULL
);

-- The dashboard's two query shapes: "events in the last N days" and
-- "counts grouped by type/path" -- these three indexes cover both. No
-- index on `value`: it's only ever aggregated (SUM/AVG) within a
-- type+created_at slice already narrowed by the indexes above, so a
-- dedicated index wouldn't earn its write-cost/storage back.
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_type_created_at ON events (type, created_at);
