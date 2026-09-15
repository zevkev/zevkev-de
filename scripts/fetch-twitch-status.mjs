// Polls the official Twitch Helix API for live status and writes
// assets/data/live-status.json. Needs an app access token (Client Credentials
// grant), which needs the Client Secret — so this only ever runs server-side
// in .github/workflows/data-refresh.yml, never in the browser.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL_LOGIN = "zevkev_";
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "data");
const OUT_FILE = path.join(OUT_DIR, "live-status.json");

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

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set");
  }
  const token = await getAppToken();
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${CHANNEL_LOGIN}`, {
    headers: { "Client-Id": CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch streams request failed: ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  const stream = data?.[0] || null;

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
  await writeFile(OUT_FILE, JSON.stringify(status, null, 2));
  console.log(`Live status: ${status.live ? "LIVE" : "offline"} → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
