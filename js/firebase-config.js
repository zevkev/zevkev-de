// Public Firebase client config — these values identify the project to
// Google's servers, they don't authorize anything by themselves (actual
// access is governed by the Firestore security rules and Auth providers
// configured in the Firebase console). Same "safe to embed" status as
// FOURTHWALL_STOREFRONT_TOKEN/TWITCH_CLIENT_ID in js/config.js.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBklVTLWw5BwagKsjg8VplXb6R8X47bxgI",
  authDomain: "zevkev-de.firebaseapp.com",
  projectId: "zevkev-de",
  storageBucket: "zevkev-de.firebasestorage.app",
  messagingSenderId: "766382709287",
  appId: "1:766382709287:web:58b0df533ab70a3c618c02",
};

// The one account that gets comment-moderation powers (delete any comment,
// not just its own) — mirrored by the Firestore security rules' isOwner()
// check, which is the actual enforcement; this constant just lets the UI
// decide whether to show delete buttons on other people's comments without
// a wasted round-trip that the rules would reject anyway.
export const OWNER_EMAIL = "kevlevin.zev@gmail.com";
