// Watchlist + watch-progress, synced through one Firestore doc per user
// (users/{uid}) instead of per-item documents -- one read loads everything
// for that visitor, one write per change, no live listener running in the
// background. Logged-out visitors keep using localStorage exactly as
// before; the local watchlist is merged into the account (once) the first
// time someone logs in with items already saved locally.
import { auth, db, onAuthChange } from "./auth.js";
import { trackEvent } from "./track.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const LOCAL_WATCHLIST_KEY = "zevkev-watchlist";

function localWatchlist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOCAL_WATCHLIST_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveLocalWatchlist(set) {
  localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify([...set]));
}

// In-memory cache of the current user's doc -- populated by one getDoc()
// call, kept in sync locally after that (writes go out but are never read
// back). Reset whenever the signed-in user changes.
let cache = null; // { watchlist: Set<string>, progress: Record<string, {positionSeconds, watched, updatedAt}> }
let loadPromise = null;
let cachedUid = null;

async function loadRemote(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : {};
  return { watchlist: new Set(data.watchlist || []), progress: data.progress || {}, banned: !!data.banned };
}

function persist(uid) {
  // Fire-and-forget on purpose -- callers already updated their local copy
  // of `cache` synchronously, so the UI doesn't wait on this, and nothing
  // ever reads it back (avoids a redundant read for data already in hand).
  setDoc(doc(db, "users", uid), { watchlist: [...cache.watchlist], progress: cache.progress }, { merge: true }).catch((err) =>
    console.error("Saving user data failed:", err)
  );
}

async function ensureLoaded() {
  const user = auth.currentUser;
  if (!user) return null;
  if (cache && cachedUid === user.uid) return cache;
  if (!loadPromise || cachedUid !== user.uid) {
    cachedUid = user.uid;
    loadPromise = loadRemote(user.uid)
      .then(async (remote) => {
        const local = localWatchlist();
        if (local.size) {
          local.forEach((id) => remote.watchlist.add(id));
          localStorage.removeItem(LOCAL_WATCHLIST_KEY);
        }
        cache = remote;
        if (local.size) persist(user.uid);
        return cache;
      })
      .catch((err) => {
        // Reset so a later call (e.g. clicking the watchlist star again, or
        // the next page load) gets a fresh attempt instead of being stuck
        // replaying this one rejected promise for the rest of the session.
        loadPromise = null;
        cachedUid = null;
        throw err;
      });
  }
  return loadPromise;
}

// Never throws -- a Firestore/network blip here used to reject the
// Promise.all() in youtube.js/vods.js/watchlist.js's init(), which had no
// catch of its own, silently killing the entire page's content render (the
// skeleton loaders never got replaced, reading as "nothing loads"). The
// watchlist star state is genuinely non-critical compared to that, so this
// falls back to "nothing starred yet" instead of taking the whole page down.
export async function getWatchlistIds() {
  const user = auth.currentUser;
  if (!user) return localWatchlist();
  try {
    const data = await ensureLoaded();
    return data.watchlist;
  } catch (err) {
    console.warn("Loading watchlist failed, showing videos without star state:", err);
    return new Set();
  }
}

export async function toggleWatchlistId(id) {
  const user = auth.currentUser;
  if (!user) {
    const set = localWatchlist();
    const added = !set.has(id);
    if (added) set.add(id);
    else set.delete(id);
    saveLocalWatchlist(set);
    trackEvent(added ? "watchlist_add" : "watchlist_remove", { event_category: "engagement", event_label: id });
    return set;
  }
  const data = await ensureLoaded();
  const added = !data.watchlist.has(id);
  if (added) data.watchlist.add(id);
  else data.watchlist.delete(id);
  persist(user.uid);
  trackEvent(added ? "watchlist_add" : "watchlist_remove", { event_category: "engagement", event_label: id });
  return data.watchlist;
}

// null when logged out (no resume tracking for anonymous visitors -- keeps
// this module's only network activity to signed-in users), when this item
// has no saved progress yet, or (same reasoning as getWatchlistIds() above)
// when loading it failed -- watch.js/watchlist.js both await this inside
// their own init(), so a throw here would silently kill their whole page
// render over what's ultimately just a resume-position nicety.
export async function getProgress(id) {
  if (!auth.currentUser) return null;
  try {
    const data = await ensureLoaded();
    return data?.progress[id] || null;
  } catch (err) {
    console.warn("Loading watch progress failed:", err);
    return null;
  }
}

// Called sparingly by watch.js (on pause/ended/page-hide, not on a timer)
// to keep writes minimal -- see the comment there.
export async function saveProgress(id, positionSeconds, watched) {
  const user = auth.currentUser;
  if (!user) return;
  const data = await ensureLoaded();
  data.progress[id] = { positionSeconds: Math.floor(positionSeconds), watched: !!watched, updatedAt: Date.now() };
  persist(user.uid);
}

// Read by js/comments.js before allowing a post -- reuses the same cached
// users/{uid} read as the watchlist (same reasoning throughout this file:
// one read covers everything this doc holds, nothing re-fetches it).
export async function isBanned() {
  if (!auth.currentUser) return false;
  try {
    const data = await ensureLoaded();
    return !!data.banned;
  } catch {
    return false;
  }
}

onAuthChange(() => {
  cache = null;
  loadPromise = null;
  cachedUid = null;
});
