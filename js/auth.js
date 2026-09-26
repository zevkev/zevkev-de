// Firebase Auth wrapper — the only file that touches the Firebase SDK
// directly for sign-in/out. Loaded via the gstatic CDN as real ES modules
// (no build step on this site, same reasoning as every other page script)
// rather than npm + a bundler.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, runTransaction, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { FIREBASE_CONFIG, OWNER_EMAILS } from "./firebase-config.js";
import { trackEvent } from "./track.js";
import {
  AVATAR_COLORS,
  avatarColorFor,
  avatarIconFor,
  AVATAR_ICONS,
  AVATAR_SHAPES,
  AVATAR_ACCESSORIES,
  SOCIAL_PLATFORMS,
  BIO_MAX_LENGTH,
  resolveBackgroundValue,
} from "./profile-presets.js";
// Re-exported so existing `import { AVATAR_COLORS, AVATAR_ICONS } from
// "./auth.js"` call sites (account.js, auth-ui.js, comments.js) keep working
// unchanged -- the actual data now lives in profile-presets.js (see that
// file's own header comment) so js/profil.js can share it too without
// pulling in this whole Firebase-initializing module.
export { AVATAR_COLORS, avatarColorFor, AVATAR_ICONS, AVATAR_SHAPES, AVATAR_ACCESSORIES };

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Case/whitespace-normalized on both sides -- Firebase's own token claim is
// already exactly what was used to sign up/in, so this is defensive rather
// than fixing a known mismatch, but it costs nothing and this is the one
// check every moderation/admin surface (this file's own comment-delete
// bypass, /privat/, the users-collection ban/delete actions) ultimately
// depends on, so it's worth not being fragile about.
export function isOwner(user) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  return OWNER_EMAILS.some((owner) => email === owner.trim().toLowerCase());
}

// AVATAR_COLORS/avatarColorFor/avatarIconFor/AVATAR_ICONS/AVATAR_SHAPES/
// AVATAR_ACCESSORIES now live in profile-presets.js (imported above) --
// moved there so js/profil.js can share the exact same data without
// importing this whole Firebase-initializing module.

// The full avatar "Baukasten" config -- shape/colors/icon/accessory -- is
// encoded as query-string-style params inside the Auth profile's own
// photoURL field instead of a Firestore doc (or Firebase Storage: nothing
// here is ever a real image, it's ~6 short values, so this whole feature
// costs zero extra reads AND zero Storage). photoURL comes along for free
// on every onAuthStateChanged/user object already loaded for displayName,
// so the header chip etc. render with no extra fetch. Parsed with
// URLSearchParams (not a fixed-order regex) so new fields can be added
// later without breaking old encoded values -- every field here is
// optional and falls back independently. Not a real URL -- Firebase stores
// whatever string updateProfile() is given without validating its shape,
// and nothing here ever loads it as an image, so that's fine.
function isHex6(v) {
  return typeof v === "string" && /^[0-9a-fA-F]{6}$/.test(v);
}
function parseAvatarPrefs(user) {
  const raw = user?.photoURL || "";
  const fallback = { color: avatarColorFor(user?.uid || ""), icon: null, shape: "circle", iconColor: null, accessory: null, ring: null };
  if (!raw.startsWith("avatar:")) return fallback;
  const params = new URLSearchParams(raw.slice(7));
  const colorRaw = params.get("color");
  const iconKey = params.get("icon");
  const shapeKey = params.get("shape");
  const iconColorRaw = params.get("iconColor");
  const accessoryKey = params.get("accessory");
  const ringRaw = params.get("ring");
  return {
    color: isHex6(colorRaw) ? `#${colorRaw}` : fallback.color,
    icon: iconKey && AVATAR_ICONS[iconKey] ? iconKey : null,
    shape: shapeKey && AVATAR_SHAPES[shapeKey] ? shapeKey : "circle",
    iconColor: isHex6(iconColorRaw) ? `#${iconColorRaw}` : null,
    accessory: accessoryKey && AVATAR_ACCESSORIES[accessoryKey] ? accessoryKey : null,
    ring: isHex6(ringRaw) ? `#${ringRaw}` : null,
  };
}
export { parseAvatarPrefs };

// prefs: { color, icon, shape, iconColor, accessory, ring } -- every field
// but color is optional (omit/clear to reset that one axis back to its
// default). Re-validates everything here rather than trusting the caller,
// same reasoning as updateProfileCustomization below: this round-trips
// through a plain string field with no schema enforcement of its own.
export async function updateAvatarPrefs(prefs) {
  const user = auth.currentUser;
  if (!user) throw new Error("Nicht angemeldet.");
  const hex = String(prefs?.color || "").replace("#", "");
  if (!isHex6(hex)) throw new Error("Ungültige Farbe.");
  const params = new URLSearchParams();
  params.set("color", hex);
  if (prefs.icon && AVATAR_ICONS[prefs.icon]) params.set("icon", prefs.icon);
  if (prefs.shape && AVATAR_SHAPES[prefs.shape] && prefs.shape !== "circle") params.set("shape", prefs.shape);
  const iconColorHex = String(prefs.iconColor || "").replace("#", "");
  if (isHex6(iconColorHex)) params.set("iconColor", iconColorHex);
  if (prefs.accessory && AVATAR_ACCESSORIES[prefs.accessory]) params.set("accessory", prefs.accessory);
  const ringHex = String(prefs.ring || "").replace("#", "");
  if (isHex6(ringHex)) params.set("ring", ringHex);
  await updateProfile(user, { photoURL: `avatar:${params.toString()}` });
  await syncPublicProfile();
}

// profiles/{uid} is a small, deliberately separate PUBLIC collection (not
// users/{uid}, which holds private watchlist/progress data) -- it exists
// because a comment card or a visitor clicking someone's name can never
// read another person's live Firebase Auth object (displayName/photoURL
// only exist on your OWN auth.currentUser), so anything meant to be
// visible on a public /profil/ page has to be denormalized somewhere
// readable by anyone. Keeping it a separate collection (vs. adding public-
// read rules to users/{uid}) avoids field-level Firestore rules entirely --
// this whole doc is public, users/{uid} stays fully private.
async function syncPublicProfile(extra = {}) {
  const user = auth.currentUser;
  if (!user) return;
  const prefs = parseAvatarPrefs(user);
  const name = user.displayName || user.email?.split("@")[0] || "Account";
  await setDoc(
    doc(db, "profiles", user.uid),
    {
      displayName: name,
      avatarColor: prefs.color,
      avatarIcon: prefs.icon,
      avatarShape: prefs.shape,
      avatarIconColor: prefs.iconColor,
      avatarAccessory: prefs.accessory,
      avatarRing: prefs.ring,
      ...extra,
    },
    { merge: true }
  ).catch((err) => console.warn("Public profile sync failed:", err));
  // Denormalized onto the PRIVATE users/{uid} doc (not profiles/{uid} above,
  // which is public-readable -- email must never end up there) purely so
  // /privat/'s admin "Nutzer" tab has a name+email to show without needing
  // the Admin SDK's listUsers(), which isn't available client-side at all.
  await setDoc(doc(db, "users", user.uid), { email: user.email || null, displayName: name }, { merge: true }).catch((err) =>
    console.warn("User record sync failed:", err)
  );
}

// Bio + social link buttons + background preset -- the customizable part of
// a public profile beyond avatar/name (see js/profil.js for how these
// render). Validated here (not just trusted from the caller) since this
// writes straight to the public profiles/{uid} doc: an unrecognized socials
// key would otherwise sit in Firestore forever, rendering as nothing useful
// on the profile page but never cleaned up. background accepts either a
// known preset key OR a raw #rrggbb from the custom color picker (see
// resolveBackgroundValue) -- both are just short strings, so a custom pick
// costs exactly the same as a preset.
export async function updateProfileCustomization(bio, socials, background) {
  const user = auth.currentUser;
  if (!user) throw new Error("Nicht angemeldet.");
  const cleanBio = String(bio || "").trim().slice(0, BIO_MAX_LENGTH);
  const cleanSocials = {};
  for (const [key, value] of Object.entries(socials || {})) {
    if (!SOCIAL_PLATFORMS[key]) continue; // drop anything not a recognized platform
    const trimmed = String(value || "").trim();
    if (trimmed) cleanSocials[key] = trimmed;
  }
  const cleanBackground = resolveBackgroundValue(background) ? background : "";
  await syncPublicProfile({ bio: cleanBio, socials: cleanSocials, background: cleanBackground });
}


// Shared avatar-circle CONTENT (just the inner markup -- icon or letter,
// not the wrapping element/size/background) so the header chip and the
// account page's big avatar render identically instead of duplicating this
// branch twice. iconColor overrides the icon's stroke color when set
// (otherwise it inherits the wrapper's own `color`, i.e. white, same as
// before this field existed -- fully backward compatible).
export function avatarContentHTML(user, iconSize = 20) {
  const { icon, iconColor } = parseAvatarPrefs(user);
  if (icon && AVATAR_ICONS[icon]) {
    const style = iconColor ? ` style="color:${iconColor}"` : "";
    return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"${style}>${AVATAR_ICONS[icon]}</svg>`;
  }
  const name = user?.displayName || user?.email?.split("@")[0] || "Account";
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return letter.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Returns the CSS class for the avatar's outer silhouette (see
// .avatar-shape-* in style.css) -- a plain string so every render call site
// (header chip, account page, public profile) just appends it to their own
// wrapper's class list instead of each re-deriving it from parseAvatarPrefs.
export function avatarShapeClass(user) {
  return `avatar-shape-${parseAvatarPrefs(user).shape}`;
}

// Inline style for a "big" avatar wrapper: the background color plus the
// --avatar-ring custom property those wrappers' own `border` declarations
// read (see .account-avatar-lg/.profil-avatar in css/account.css/profil.css)
// -- falls back to their own CSS default (white) when no ring is set, same
// as before this field existed. Not used for the header chip/nav dropdown,
// which keep their fixed subtle border regardless of a user's ring pick
// (too small for a colored ring to read as anything but a smudge).
export function avatarStyleAttr(user) {
  const { color, ring } = parseAvatarPrefs(user);
  return ring ? `background:${color};--avatar-ring:${ring}` : `background:${color}`;
}

// The small badge overlay -- ONLY meant for "big" avatar contexts (account
// page, editor preview, public profile); deliberately not wired into
// avatarContentHTML itself so the header chip / nav dropdown (14-18px, no
// room for a legible badge) don't get it automatically. The wrapper needs
// `position:relative` for this absolutely-positioned badge to place
// correctly -- see .avatar-badge in style.css.
export function avatarBadgeHTML(user) {
  const { accessory } = parseAvatarPrefs(user);
  const def = accessory && AVATAR_ACCESSORIES[accessory];
  if (!def) return "";
  return `<span class="avatar-badge" style="background:${def.color}" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="#fff" stroke="none">${def.icon}</svg></span>`;
}

// Usernames are reserved in their own top-level `usernames/{normalized}`
// collection (doc id IS the normalized name, so existence-checks are a
// single cheap read/transaction step rather than a query) -- this is what
// actually enforces "no two accounts with the same name", both here and in
// the Firestore rules (see CLAUDE.md/console: usernames/{name} allows create
// only when request.resource.data.uid == the requester's own uid).
function normalizeUsername(name) {
  return String(name || "").trim().toLowerCase();
}

// Throws with a message meant to be shown directly (see authErrorMessage's
// sibling usage in auth-ui.js) if the name is invalid or already taken by a
// different account. No-ops (resolves normally) if it's already this same
// account's own reserved name, so re-submitting the unchanged name in the
// account page's rename form isn't an error.
async function reserveUsername(uid, rawName, previousNormalized) {
  const normalized = normalizeUsername(rawName);
  if (normalized.length < 2 || normalized.length > 24) {
    throw new Error("Der Username muss zwischen 2 und 24 Zeichen lang sein.");
  }
  if (normalized === previousNormalized) return; // unchanged, nothing to reserve
  const ref = doc(db, "usernames", normalized);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().uid !== uid) {
      throw new Error("TAKEN");
    }
    tx.set(ref, { uid });
  }).catch((err) => {
    if (err.message === "TAKEN") throw new Error("Dieser Username ist schon vergeben.");
    throw err;
  });
  if (previousNormalized) {
    await deleteDoc(doc(db, "usernames", previousNormalized)).catch(() => {});
  }
}

// Best-effort, never blocks sign-in -- used right after a brand-new Google
// account's first sign-in to reserve the display name Google already gave
// them. If that name happens to collide with an existing account's own
// chosen username, the Google sign-in still succeeds (a login can't
// reasonably fail over a name collision); they just won't have it reserved
// and can pick a different one on the account page any time.
function tryReserveUsername(uid, rawName) {
  reserveUsername(uid, rawName, null).catch((err) => console.warn("Username reservation skipped:", err.message));
}

// A signed-in-but-unverified email/password account can't comment (enforced
// server-side too, see the Firestore rules' isVerified()) -- Google sign-in
// accounts are already verified by Google itself, so this is only ever
// false for the email/password path.
export function canPost(user) {
  return !!user && user.emailVerified;
}

// Fires immediately with the current user (or null) and again on every
// sign-in/sign-out — same contract as Firebase's own onAuthStateChanged,
// re-exported so callers only ever import from this one file.
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Resolves once Firebase has restored (or confirmed there is no) persisted
// session -- auth.currentUser reads null synchronously until that first
// onAuthStateChanged fire, even for a returning signed-in visitor, so any
// code that reads auth.currentUser directly at page-load time (before
// awaiting this) silently treats a signed-in visitor as anonymous. Real bug
// this caught: js/user-data.js's getWatchlistIds()/getProgress()/
// toggleWatchlistId()/isBanned() all read auth.currentUser synchronously --
// awaiting this at the top of each fixes every caller (watch.js, youtube.js,
// vods.js, watchlist.js) at once instead of each page having to remember to
// gate its own init() on onAuthChange the way account.js already did.
let resolveAuthReady;
export const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});
const unsubscribeAuthReady = onAuthStateChanged(auth, () => {
  resolveAuthReady();
  unsubscribeAuthReady();
});

export async function signUpWithEmail(username, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await reserveUsername(cred.user.uid, username, null);
  } catch (err) {
    // The auth account itself already exists at this point -- rather than
    // leave an orphaned account with no reserved name (and a confusing
    // "email already in use" on the next signup attempt), undo it and
    // surface the real reason so the visitor can just try a different name.
    await cred.user.delete().catch(() => {});
    throw err;
  }
  // Seed a starting color+icon combo right away instead of leaving icon
  // unset until a manual /account/ visit -- avatarColorFor's live fallback
  // already gives every account a color for free, but never an icon, so two
  // brand-new accounts could otherwise both show up as a plain "K" circle.
  const hex = avatarColorFor(cred.user.uid).replace("#", "");
  await updateProfile(cred.user, { displayName: username, photoURL: `avatar:color=${hex}&icon=${avatarIconFor(cred.user.uid)}` });
  await syncPublicProfile();
  // Fire-and-forget -- a failure here (rare: quota/network) shouldn't block
  // account creation itself. The comments UI offers its own "send again"
  // button (js/comments.js) for whenever this didn't arrive.
  sendEmailVerification(cred.user).catch((err) => console.warn("Verification email failed to send:", err));
  trackEvent("sign_up", { method: "email" });
  return cred.user;
}

// Renames the signed-in user's own display name, enforcing site-wide
// uniqueness (see reserveUsername) before touching the Auth profile field
// itself -- if the name's taken, the profile is left untouched.
export async function updateDisplayName(newName) {
  const user = auth.currentUser;
  if (!user) throw new Error("Nicht angemeldet.");
  const trimmed = String(newName || "").trim();
  await reserveUsername(user.uid, trimmed, normalizeUsername(user.displayName));
  await updateProfile(user, { displayName: trimmed });
  await syncPublicProfile();
}

// Permanently deletes the signed-in user's account: every comment they
// wrote, their reserved username, their users/{uid} doc (watchlist/
// progress), and the Firebase Auth account itself, in that order --
// Firestore writes have to happen *before* the Auth user is gone, since
// request.auth would be null (and every rule above requires isSignedIn())
// the instant deleteUser() resolves. Comments rule allows delete when
// request.auth.uid == resource.data.authorId, same as the single-comment
// delete button already used elsewhere, just looped over every comment
// this uid ever wrote instead of one at a time.
export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error("Nicht angemeldet.");
  const uid = user.uid;
  const ownComments = await getDocs(query(collection(db, "comments"), where("authorId", "==", uid))).catch(() => null);
  if (ownComments) await Promise.all(ownComments.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  // Looked up by uid (not user.displayName) on purpose -- displayName can be
  // null for a legitimately signed-in user (confirmed live: an interrupted
  // signup left exactly this state, see login.js's onAuthChange race fix),
  // and a stale/empty displayName here used to silently skip releasing the
  // real reservation, permanently blocking that name for anyone else even
  // after this account was gone. Querying by uid finds it regardless of
  // whatever displayName says.
  const ownUsernames = await getDocs(query(collection(db, "usernames"), where("uid", "==", uid))).catch(() => null);
  if (ownUsernames) await Promise.all(ownUsernames.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  await deleteDoc(doc(db, "users", uid)).catch(() => {});
  await deleteDoc(doc(db, "profiles", uid)).catch(() => {});
  await deleteUser(user);
}

export async function resendVerificationEmail() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

// Firebase's client SDK does NOT automatically notice a verification link
// clicked in another tab (or even a plain reload of this same tab) -- the
// locally persisted user record, and the ID token every Firestore write is
// stamped with, both stay frozen at whatever emailVerified was during the
// last real sign-in until something explicitly asks the server again. A
// visitor who verifies and comes straight back would otherwise still get
// stuck behind the "please verify" gate, or see it disappear but have their
// comment silently rejected server-side by the Firestore rules' isVerified()
// check, which reads the (still stale) token claim, not the live account.
// reload() refreshes the user object itself; getIdToken(true) forces a fresh
// token mint so the *next* Firestore write actually carries the new claim.
export async function refreshUser() {
  if (!auth.currentUser) return null;
  try {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
  } catch (err) {
    console.warn("Refreshing verification status failed:", err);
  }
  return auth.currentUser;
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  trackEvent("login", { method: "email" });
  return cred.user;
}

// There was previously no way at all to recover an email/password account
// once its password was forgotten -- the login form had no "forgot
// password" path, and Firebase's own reset flow was never wired up.
// auth/user-not-found is deliberately swallowed (treated the same as a real
// send) rather than surfaced -- showing "no account with that email" vs.
// "email sent" would let this double as a probe for which addresses have
// an account here. Every other failure (invalid email format, rate limit)
// still throws, since neither of those leaks that information.
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }
}

// Popups are blocked outright (or just don't work reliably) in a lot of
// mobile browser contexts -- Safari on iOS in particular, and any in-app
// browser (Instagram/TikTok/etc. webviews). Falls back to a full-page
// redirect round-trip there instead of just showing an error. The redirect
// half of that round-trip is completed by consumeGoogleRedirect() below,
// called once at module load.
function isPopupLikelyBlocked() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok/.test(ua);
  return isIOS || isInAppBrowser || window.innerWidth < 700;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  if (isPopupLikelyBlocked()) {
    await signInWithRedirect(auth, provider);
    return null; // page navigates away; the caller never sees a resolved user here
  }
  try {
    const cred = await signInWithPopup(auth, provider);
    const isNewUser = !!getAdditionalUserInfo(cred)?.isNewUser;
    trackEvent(isNewUser ? "sign_up" : "login", { method: "google" });
    if (isNewUser) {
      if (cred.user.displayName) tryReserveUsername(cred.user.uid, cred.user.displayName);
      // Overwrites Google's own real profile-photo URL with our own encoded
      // avatar prefs -- parseAvatarPrefs only ever recognizes its own
      // avatar:color=... format anyway (see its regex), so leaving Google's
      // photoURL in place would just silently fall back to the plain-letter/
      // hash-color combo like an email signup that never got seeded.
      const hex = avatarColorFor(cred.user.uid).replace("#", "");
      await updateProfile(cred.user, { photoURL: `avatar:color=${hex}&icon=${avatarIconFor(cred.user.uid)}` }).catch(() => {});
      await syncPublicProfile();
    }
    return cred.user;
  } catch (err) {
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

// Completes the signInWithRedirect() round-trip above -- called once at
// module load (bottom of this file) so a page landed on after the Google
// redirect finishes signing in before anything else runs. Resolves to null
// on any normal page load that isn't a redirect return (nothing to do).
export function consumeGoogleRedirect() {
  return getRedirectResult(auth)
    .then(async (cred) => {
      if (cred) {
        const isNewUser = !!getAdditionalUserInfo(cred)?.isNewUser;
        trackEvent(isNewUser ? "sign_up" : "login", { method: "google" });
        if (isNewUser) {
          if (cred.user.displayName) tryReserveUsername(cred.user.uid, cred.user.displayName);
          const hex = avatarColorFor(cred.user.uid).replace("#", "");
          await updateProfile(cred.user, { photoURL: `avatar:color=${hex}&icon=${avatarIconFor(cred.user.uid)}` }).catch(() => {});
          await syncPublicProfile();
        }
      }
      return cred;
    })
    .catch((err) => {
      console.warn("Google redirect sign-in failed:", err);
      return null;
    });
}

export async function signOutUser() {
  await signOut(auth);
}

// Firebase's own error.code strings ("auth/wrong-password" etc.), translated
// to short German messages for the auth form. Falls back to a generic
// message for anything not explicitly listed rather than showing raw
// Firebase English text in an otherwise all-German UI.
const ERROR_MESSAGES = {
  "auth/invalid-email": "Diese E-Mail-Adresse sieht nicht gültig aus.",
  "auth/user-not-found": "Kein Konto mit dieser E-Mail gefunden.",
  "auth/wrong-password": "Falsches Passwort.",
  "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
  "auth/email-already-in-use": "Für diese E-Mail existiert bereits ein Konto — einfach anmelden.",
  "auth/weak-password": "Das Passwort muss mindestens 6 Zeichen lang sein.",
  "auth/too-many-requests": "Zu viele Versuche. Bitte kurz warten und nochmal probieren.",
  "auth/popup-closed-by-user": "Google-Anmeldung abgebrochen.",
  "auth/popup-blocked": "Pop-up wurde blockiert — versuche es nochmal, du wirst dann direkt weitergeleitet.",
  "auth/cancelled-popup-request": "Google-Anmeldung abgebrochen.",
  "auth/network-request-failed": "Keine Verbindung — bitte Internetverbindung prüfen.",
  "auth/requires-recent-login": "Bitte melde dich ab und wieder an, dann versuche es erneut (aus Sicherheitsgründen nötig für diese Aktion).",
};
// Plain Error()s thrown from this file itself (reserveUsername's "taken"/
// length checks, updateDisplayName, deleteAccount) carry no .code -- their
// own .message is already the user-facing German text, so those are shown
// as-is instead of falling through to the generic fallback below.
export function authErrorMessage(err) {
  if (err?.code) return ERROR_MESSAGES[err.code] || "Das hat leider nicht geklappt. Bitte nochmal versuchen.";
  return err?.message || "Das hat leider nicht geklappt. Bitte nochmal versuchen.";
}

consumeGoogleRedirect();
