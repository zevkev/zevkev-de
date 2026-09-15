// Polls the official Twitch Helix API for live status + the channel's own
// archived VODs, writing assets/data/live-status.json and
// assets/data/twitch-vods.json. Needs an app access token (Client Credentials
// grant), which needs the Client Secret — so this only ever runs server-side
// in .github/workflows/data-refresh.yml, never in the browser.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL_LOGIN = "zevkev_";
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "data");

async function getAppToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Twitch token request failed: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function helix(path, token) {
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: { "Client-Id": CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch API ${res.status} on ${path}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set");
  }
  const token = await getAppToken();

  const { data: users } = await helix(`/users?login=${CHANNEL_LOGIN}`, token);
  const broadcasterId = users?.[0]?.id;
  if (!broadcasterId) throw new Error(`Could not resolve Twitch user id for ${CHANNEL_LOGIN}`);

  const { data: streams } = await helix(`/streams?user_login=${CHANNEL_LOGIN}`, token);
  const stream = streams?.[0] || null;

  const status = {
    checkedAt: new Date().toISOString(),
    live: !!stream,
    title: stream?.title || null,
    game: stream?.game_name || null,
    startedAt: stream?.started_at || null,
    viewerCount: stream?.viewer_count ?? null,
    thumbnailUrl: stream?.thumbnail_url ? stream.thumbnail_url.replace("{width}", "440").replace("{height}", "248") : null,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "live-status.json"), JSON.stringify(status, null, 2));
  console.log(`Live status: ${status.live ? "LIVE" : "offline"}`);

  const { data: videos } = await helix(`/videos?user_id=${broadcasterId}&type=archive&first=12`, token);
  const vods = {
    updatedAt: new Date().toISOString(),
    videos: (videos || []).map((v) => ({
      id: v.id,
      title: v.title,
      publishedAt: v.published_at || v.created_at,
      thumbnail: v.thumbnail_url ? v.thumbnail_url.replace("%{width}", "440").replace("%{height}", "248") : null,
      duration: v.duration,
      viewCount: v.view_count,
      url: v.url,
    })),
  };
  await writeFile(path.join(OUT_DIR, "twitch-vods.json"), JSON.stringify(vods, null, 2));
  console.log(`Wrote ${vods.videos.length} Twitch VODs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
