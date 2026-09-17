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
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { FIREBASE_CONFIG, OWNER_EMAIL } from "./firebase-config.js";

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function isOwner(user) {
  return !!user && user.email === OWNER_EMAIL;
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
  await updateProfile(cred.user, { displayName: username });
  // Fire-and-forget -- a failure here (rare: quota/network) shouldn't block
  // account creation itself. The comments UI offers its own "send again"
  // button (js/comments.js) for whenever this didn't arrive.
  sendEmailVerification(cred.user).catch((err) => console.warn("Verification email failed to send:", err));
  return cred.user;
}

export async function resendVerificationEmail() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
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
  return getRedirectResult(auth).catch((err) => {
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
};
export function authErrorMessage(err) {
  return ERROR_MESSAGES[err?.code] || "Das hat leider nicht geklappt. Bitte nochmal versuchen.";
}

consumeGoogleRedirect();
