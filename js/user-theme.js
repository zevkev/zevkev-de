// Applies a signed-in visitor's chosen profile background color as their
// own personal accent across the WHOLE site, not just their public
// /user/<name>/ page -- every page's body background already reads the
// shared --blue-mat custom property (see css/style.css), so overriding it
// here on <html> (inline styles beat the stylesheet's own :root
// declaration) is all that's needed; every grid/texture layer already
// painted on top of it keeps working unmodified, same mechanism
// js/profil.js already uses locally for just its own page.
//
// Two-phase, same pattern as js/flags.js: a cached value applies instantly
// and synchronously below (no Firebase dependency, no flash of the default
// color), then a background refresh corrects it live if Firestore disagrees
// -- covers a change made on another device, or the very first load on a
// fresh browser with no cache yet.
import { resolveBackgroundValue } from "./profile-presets.js";

const CACHE_KEY = "zevkev-user-bg-cache";

// The homepage is a special case: body.home doesn't use --blue-mat at all
// -- css/home.css gives its own scroll "zones" (hero/discord/twitch
// sections) three separately-tuned dark shades of their own
// (--zone-hero/--zone-discord/--zone-twitch) for visual rhythm between
// zones, deliberately bypassing the shared mat token (see that file's own
// comment on why). Confirmed live: overriding only --blue-mat left the
// homepage showing its default navy while every other page correctly
// recolored. Flattening all three zone tokens to the same chosen color too
// means the homepage loses that zone-to-zone shade variation in exchange
// for actually being personalized like the user asked (color cascades
// "everywhere, not just the profile tab") -- every other page only has the
// one --blue-mat token to begin with, so this is homepage-only.
const ZONE_VARS = ["--zone-hero", "--zone-discord", "--zone-twitch"];

function apply(value) {
  if (value) {
    document.documentElement.style.setProperty("--blue-mat", value);
    ZONE_VARS.forEach((v) => document.documentElement.style.setProperty(v, value));
  } else {
    document.documentElement.style.removeProperty("--blue-mat");
    ZONE_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
  }
}

function readCache() {
  try {
    return localStorage.getItem(CACHE_KEY) || "";
  } catch {
    return "";
  }
}
function writeCache(value) {
  try {
    if (value) localStorage.setItem(CACHE_KEY, value);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore -- private browsing / storage full, just skip caching
  }
}

apply(readCache());

// Called directly by js/account.js right after a successful profile-
// customization save, so the visitor's OWN change reflects instantly on
// every page they go to next without waiting on the background refresh
// below (which only runs once per page LOAD, not on this tab's own writes).
export function applyUserTheme(value) {
  const resolved = resolveBackgroundValue(value) || "";
  apply(resolved || null);
  writeCache(resolved);
}

// Background refresh of that cache -- dynamic imports so this stays non-
// blocking and doesn't turn this file into a hard Firebase dependency.
// Every page already loads Firebase somewhere (the header login chip alone
// guarantees it), so this is very often just reusing an SDK fetch already
// in flight, not triggering a new one.
import("./auth.js")
  .then(async ({ auth, authReady, db }) => {
    await authReady;
    const user = auth.currentUser;
    if (!user) {
      // Signed out (or never signed in) -- no personal theme applies here.
      // Clears any stale cache/override left over from a previous signed-in
      // visit on this browser instead of leaving it stuck on someone's old
      // accent forever after they log out.
      if (readCache()) {
        apply(null);
        writeCache("");
      }
      return;
    }
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    const snap = await getDoc(doc(db, "profiles", user.uid));
    const resolved = resolveBackgroundValue(snap.exists() ? snap.data().background : "") || "";
    if (resolved !== readCache()) {
      apply(resolved || null);
      writeCache(resolved);
    }
  })
  .catch(() => {});
