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
  deleteUser,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, deleteDoc, runTransaction, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { FIREBASE_CONFIG, OWNER_EMAIL } from "./firebase-config.js";
import { trackEvent } from "./track.js";

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function isOwner(user) {
  return !!user && user.email === OWNER_EMAIL;
}

// Deterministic per-account color -- derived from the uid itself rather than
// rolled once and stored, so it's free (no extra Firestore read/write, ever
// available instantly) while still being exactly as "persisted per account"
// as a stored value would be: the same uid always hashes to the same color.
// Used as the fallback whenever a visitor hasn't picked their own color yet
// (see parseAvatarPrefs below) -- also the selectable swatch list on the
// account page's "Avatar anpassen" picker.
export const AVATAR_COLORS = ["#e07856", "#5b8c5a", "#4a7c9e", "#9b6b9e", "#c9a227", "#3f9c8f", "#c1548a", "#6b7fd7", "#d4823f", "#4f9d6e"];
export function avatarColorFor(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// A small curated icon library a visitor can pick instead of their plain
// initial letter -- keyed by name so only the short key (not the SVG
// markup) needs to round-trip through photoURL below. Plain stroke paths,
// same 24x24/stroke-width:1.8-2 convention as this codebase's other icons.
export const AVATAR_ICONS = {
  star: '<path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-6.5-4.2-9-8.2C1 8.4 2.5 5 6 5c2 0 3.5 1.1 4.5 2.6C11.5 6.1 13 5 15 5c3.5 0 5 3.4 3 6.8-2.5 4-9 8.2-9 8.2z" stroke-linejoin="round"/>',
  ghost: '<path d="M12 3c-4 0-7 3-7 7v9l2.5-2 2 2 2.5-2 2.5 2 2-2 2.5 2v-9c0-4-3-7-7-7z" stroke-linejoin="round"/><circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 5H5a3 3 0 0 0 3 5M16 5h3a3 3 0 0 1-3 5"/><path d="M12 13v4M9 20h6M10 17h4"/>',
  flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-1-2-1-2 1 0 3 2 3 5a5 5 0 0 1-10 0c0-5 3-6 5-11z" stroke-linejoin="round"/>',
  controller: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10.5v4M5 12.5h4M16 11h.01M19 13h.01"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2" y="13" width="4" height="6" rx="1.5"/><rect x="18" y="13" width="4" height="6" rx="1.5"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5"/>',
};

// Custom avatar color/icon is encoded into the Auth profile's own photoURL
// field instead of a Firestore doc -- photoURL comes along for free on
// every onAuthStateChanged/user object already loaded for displayName, so
// this stays a zero-extra-read feature (this project deliberately keeps
// Firestore reads minimal, see js/user-data.js/js/comments.js) rather than
// adding a users/{uid} read to every page the header avatar appears on.
// Not a real URL -- Firebase stores whatever string updateProfile() is
// given without validating its shape, and nothing here ever loads it as an
// image, so that's fine.
function parseAvatarPrefs(user) {
  const raw = user?.photoURL || "";
  const m = /^avatar:color=([0-9a-fA-F]{6})(?:&icon=(\w+))?$/.exec(raw);
  if (m) return { color: `#${m[1]}`, icon: m[2] && AVATAR_ICONS[m[2]] ? m[2] : null };
  return { color: avatarColorFor(user?.uid || ""), icon: null };
}
export { parseAvatarPrefs };

export async function updateAvatarPrefs(color, iconKey) {
  const user = auth.currentUser;
  if (!user) throw new Error("Nicht angemeldet.");
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Ungültige Farbe.");
  const photoURL = iconKey && AVATAR_ICONS[iconKey] ? `avatar:color=${hex}&icon=${iconKey}` : `avatar:color=${hex}`;
  await updateProfile(user, { photoURL });
}

// Shared avatar-circle CONTENT (just the inner markup -- icon or letter,
// not the wrapping element/size/background) so the header chip and the
// account page's big avatar render identically instead of duplicating this
// branch twice.
export function avatarContentHTML(user, iconSize = 20) {
  const { icon } = parseAvatarPrefs(user);
  if (icon && AVATAR_ICONS[icon]) {
    return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${AVATAR_ICONS[icon]}</svg>`;
  }
  const name = user?.displayName || user?.email?.split("@")[0] || "Account";
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return letter.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
  await updateProfile(cred.user, { displayName: username });
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
  const normalized = normalizeUsername(user.displayName);
  if (normalized) await deleteDoc(doc(db, "usernames", normalized)).catch(() => {});
  await deleteDoc(doc(db, "users", uid)).catch(() => {});
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
    if (isNewUser && cred.user.displayName) tryReserveUsername(cred.user.uid, cred.user.displayName);
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
    .then((cred) => {
      if (cred) {
        const isNewUser = !!getAdditionalUserInfo(cred)?.isNewUser;
        trackEvent(isNewUser ? "sign_up" : "login", { method: "google" });
        if (isNewUser && cred.user.displayName) tryReserveUsername(cred.user.uid, cred.user.displayName);
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
