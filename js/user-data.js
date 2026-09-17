// Watchlist + watch-progress, synced through one Firestore doc per user
// (users/{uid}) instead of per-item documents -- one read loads everything
// for that visitor, one write per change, no live listener running in the
// background. Logged-out visitors keep using localStorage exactly as
// before; the local watchlist is merged into the account (once) the first
// time someone logs in with items already saved locally.
import { auth, db, onAuthChange } from "./auth.js";
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
  return { watchlist: new Set(data.watchlist || []), progress: data.progress || {} };
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
    loadPromise = loadRemote(user.uid).then(async (remote) => {
      const local = localWatchlist();
      if (local.size) {
        local.forEach((id) => remote.watchlist.add(id));
        localStorage.removeItem(LOCAL_WATCHLIST_KEY);
      }
      cache = remote;
      if (local.size) persist(user.uid);
      return cache;
    });
  }
  return loadPromise;
}

export async function getWatchlistIds() {
  const user = auth.currentUser;
  if (!user) return localWatchlist();
  const data = await ensureLoaded();
  return data.watchlist;
}

export async function toggleWatchlistId(id) {
  const user = auth.currentUser;
  if (!user) {
    const set = localWatchlist();
    if (set.has(id)) set.delete(id);
    else set.add(id);
    saveLocalWatchlist(set);
    return set;
  }
  const data = await ensureLoaded();
  if (data.watchlist.has(id)) data.watchlist.delete(id);
  else data.watchlist.add(id);
  persist(user.uid);
  return data.watchlist;
}

// null when logged out (no resume tracking for anonymous visitors -- keeps
// this module's only network activity to signed-in users) or when this
// item has no saved progress yet.
export async function getProgress(id) {
  if (!auth.currentUser) return null;
  const data = await ensureLoaded();
  return data?.progress[id] || null;
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

onAuthChange(() => {
  cache = null;
  loadPromise = null;
  cachedUid = null;
});
