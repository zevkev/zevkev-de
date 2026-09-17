// Fetches the FULL upload history for the main channel (@ZevKev) via the
// YouTube Data API v3 and writes assets/data/main-videos.json in the exact
// same shape the previous RSS-based version produced — js/youtube.js reads
// that shape, not how it was gathered, so nothing there needed to change.
//
// WHY THIS EXISTS: YouTube's public RSS feed (feeds/videos.xml), which the
// old version of this script scraped, is hard-capped by YouTube itself at
// roughly the channel's 15 most recent uploads with no pagination — there is
// no page 2 to request. playlistItems.list, paginated with pageToken against
// the channel's uploads playlist, has no such cap.
//
// ONE-TIME SETUP NEEDED (by the Google account that manages the channel —
// this is a human/console step, an assistant or script cannot do it):
//   1. https://console.cloud.google.com/ -> create or pick a project.
//   2. APIs & Services -> Library -> enable "YouTube Data API v3".
//   3. APIs & Services -> Credentials -> Create Credentials -> API key.
//      (Optional but recommended: restrict the key to "YouTube Data API v3".)
//   4. In the GitHub repo: Settings -> Secrets and variables -> Actions ->
//      New repository secret -> name it YOUTUBE_API_KEY, value = that key.
//      .github/workflows/data-refresh.yml already reads it from there and
//      passes it to this script as an env var — no further wiring needed.
//
// Until that secret exists, main() throws immediately (see the guard right
// below) instead of writing an empty/broken file. The workflow step this
// runs in is marked continue-on-error for exactly that reason (mirroring the
// Twitch step further down the same workflow): a missing/invalid key skips
// this one step and leaves the last committed main-videos.json as-is, rather
// than blocking the VOD feed step above it or the commit step below it.
//
// QUOTA NOTE: the default Data API quota is 10,000 units/day. Each run here
// costs roughly 1 (channels.list) + ceil(videoCount/50) (playlistItems.list)
// + ceil(videoCount/50) (videos.list) units — trivial today, but data-refresh
// runs every 5 minutes (288x/day), so once the full history is many hundreds
// of videos this is worth watching. If it ever gets close to the ceiling,
// either request a free quota increase in Cloud Console, or give this
// specific step a longer interval than the shared 5-minute cron (new uploads
// don't need 5-minute freshness the way Twitch live status does).
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL_ID = "UCpr-pIwKcVDAm-5ID_mdj7w"; // @ZevKev (verified via canonical link / externalId)
const API_KEY = process.env.YOUTUBE_API_KEY;
const API_BASE = "https://www.googleapis.com/youtube/v3";
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "data");
const OUT_FILE = path.join(OUT_DIR, "main-videos.json");

async function youtubeApiGet(endpoint, params) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url);
  if (!res.ok) {
    // Deliberately don't include `url` here — it carries ?key=<API_KEY> and
    // this message can end up in CI logs.
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API ${res.status} on ${endpoint}: ${body}`);
  }
  return res.json();
}

// The uploads playlist is the reliable, documented way to list everything a
// channel has published, in upload order. Try the API's own pointer to it
// first; fall back to YouTube's well-known UC->UU channel-id convention only
// if that lookup comes back empty (e.g. an unexpected partial response).
async function getUploadsPlaylistId() {
  const data = await youtubeApiGet("channels", { part: "contentDetails", id: CHANNEL_ID, key: API_KEY });
  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) return uploads;
  if (CHANNEL_ID.startsWith("UC")) return `UU${CHANNEL_ID.slice(2)}`;
  throw new Error(`Could not resolve the uploads playlist for channel ${CHANNEL_ID}`);
}

// Walks playlistItems.list to the end via pageToken. YouTube's uploads
// playlist is newest-first (new uploads are prepended), but the final list
// is still explicitly sorted by publishedAt further down in main() rather
// than relying on that ordering holding for every edge case.
async function fetchAllUploads(playlistId) {
  const items = [];
  let pageToken = "";
  do {
    const params = { part: "snippet,contentDetails", playlistId, maxResults: "50", key: API_KEY };
    if (pageToken) params.pageToken = pageToken;
    const data = await youtubeApiGet("playlistItems", params);
    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      // A video removed/privated since it was added to the uploads playlist
      // still shows up as an item here, just with these placeholder titles
      // and no real thumbnail/description — skip it rather than show a dead
      // card for it.
      if (!videoId || title === "Deleted video" || title === "Private video") continue;
      const thumbs = item.snippet?.thumbnails || {};
      items.push({
        id: videoId,
        title,
        // contentDetails.videoPublishedAt is the video's real publish time;
        // snippet.publishedAt is when it was added to *this playlist*, which
        // is the same instant for regular uploads but can drift for
        // premieres/scheduled videos. Prefer the more precise one.
        publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || null,
        thumbnail: thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        description: item.snippet?.description || "",
      });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return items;
}

function parseIsoDuration(iso) {
  // Videos are never long enough to need the P<n>D/W/M/Y part of ISO 8601;
  // only the PT<H><M><S> time portion ever applies here.
  const m = iso ? /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso) : null;
  if (!m) return null;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

// videos.list is where view counts (and duration, used for the Shorts
// classification below) actually live — playlistItems.list doesn't carry
// statistics.
async function fetchVideoDetails(ids) {
  const details = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await youtubeApiGet("videos", { part: "statistics,contentDetails", id: chunk.join(","), key: API_KEY });
    for (const v of data.items || []) {
      details.set(v.id, {
        views: v.statistics?.viewCount != null ? Number(v.statistics.viewCount) : null,
        durationSeconds: parseIsoDuration(v.contentDetails?.duration),
      });
    }
  }
  return details;
}

// The Data API doesn't expose a direct "is this a Short" flag. This used to
// probe /shorts/<id> for YouTube's own classification (200 = Short,
// redirect = not), but that only reflects videos YouTube itself tagged as
// Shorts at upload time — older short-duration uploads from before Shorts
// existed as a format never got that tag retroactively, so they kept
// showing up in the regular Videos tab despite being under a minute long. A
// duration cutoff classifies every video the same way regardless of when it
// was uploaded, and needs no extra network probe since duration already
// comes back from fetchVideoDetails() above.
const SHORT_MAX_SECONDS = 120;
function isShortByDuration(durationSeconds) {
  return durationSeconds != null && durationSeconds < SHORT_MAX_SECONDS;
}

async function main() {
  if (!API_KEY) {
    throw new Error("YOUTUBE_API_KEY is not set. See the setup comment at the top of this file for how to create one.");
  }

  const uploadsPlaylistId = await getUploadsPlaylistId();
  const uploads = await fetchAllUploads(uploadsPlaylistId);

  if (uploads.length === 0) {
    // Never overwrite a known-good file with an empty one — this is far more
    // likely to mean a bad channel id / key / quota exhaustion than a
    // channel that genuinely has zero videos.
    throw new Error("YouTube API returned zero uploaded videos — refusing to overwrite existing data.");
  }

  const details = await fetchVideoDetails(uploads.map((v) => v.id));

  const videos = uploads
    .map((v) => ({
      id: v.id,
      title: v.title,
      publishedAt: v.publishedAt,
      thumbnail: v.thumbnail,
      description: v.description,
      views: details.get(v.id)?.views ?? null,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      isShort: isShortByDuration(details.get(v.id)?.durationSeconds ?? null),
    }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), videos }, null, 2));
  const shortsCount = videos.filter((v) => v.isShort).length;
  console.log(`Wrote ${videos.length} videos (${shortsCount} shorts, <${SHORT_MAX_SECONDS}s) to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
