// Fetches the public YouTube RSS feed for the main channel (@ZevKev) and
// writes assets/data/main-videos.json. No API key needed, the feed is public.
// Run by .github/workflows/data-refresh.yml on a schedule.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHANNEL_ID = "UC8i_ANEhbQ54VAI5cuJH-kw"; // @ZevKev
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "data");
const OUT_FILE = path.join(OUT_DIR, "main-videos.json");

function textBetween(xml, tag, fromIndex) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open, fromIndex);
  if (start === -1) return "";
  const end = xml.indexOf(close, start);
  if (end === -1) return "";
  return xml.slice(start + open.length, end).trim();
}

function attrValue(xml, tag, attr, fromIndex) {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`);
  const slice = xml.slice(fromIndex, fromIndex + 2000);
  const m = slice.match(re);
  return m ? m[1] : "";
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function main() {
  const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (ZevKev main feed bot)" } });
  if (!res.ok) throw new Error(`YouTube feed fetch failed: ${res.status}`);
  const xml = await res.text();

  const entries = xml.split("<entry>").slice(1);
  const videos = entries.map((chunk) => {
    const videoId = textBetween(chunk, "yt:videoId", 0);
    const title = decodeEntities(textBetween(chunk, "title", 0));
    const published = textBetween(chunk, "published", 0);
    const thumb = attrValue(chunk, "media:thumbnail", "url", 0);
    const description = decodeEntities(textBetween(chunk, "media:description", 0));
    const viewsMatch = chunk.match(/<media:statistics views="(\d+)"/);
    return {
      id: videoId,
      title,
      publishedAt: published,
      thumbnail: thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      description,
      views: viewsMatch ? Number(viewsMatch[1]) : null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), videos }, null, 2));
  console.log(`Wrote ${videos.length} videos to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
