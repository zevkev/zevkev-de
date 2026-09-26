// Shared, dependency-free profanity list + helpers -- used by js/comments.js
// (censoring comment text) and js/auth.js (rejecting a profane username at
// signup/rename time, see reserveUsername). Previously BAD_WORDS/censor()
// lived only inside comments.js; moved here so auth.js can share the exact
// same list without importing that whole comments module.
//
// Starting list -- not exhaustive, just common German/English profanity.
// Extend directly in this file (plain GitHub web-UI edit, no secret/redeploy
// needed) if more words should be caught. Word-boundary matched, case
// insensitive.
export const BAD_WORDS = [
  "bastard", "arschloch", "hurensohn", "wichser", "fotze", "nutte", "schlampe",
  "scheisse", "scheiße", "hure", "missgeburt", "spast", "spasti",
  "fuck", "fucking", "shit", "bitch", "asshole", "cunt", "whore", "slut", "faggot", "nigger",
];

function wordRegexes(extra) {
  return [...BAD_WORDS, ...(extra || [])].map((word) => new RegExp(`\\b${word}\\w*`, "gi"));
}

// Censors to "first letter + asterisks" (e.g. "b****") -- used for free text
// like comments/bios where the field itself should stay but the slur
// shouldn't. extra: the live settings/moderation.bannedWords list on top of
// the baseline above (see js/privat.js's "Wörter" tab).
export function censor(text, extra) {
  let out = text;
  for (const re of wordRegexes(extra)) {
    out = out.replace(re, (m) => m[0] + "*".repeat(Math.max(1, m.length - 1)));
  }
  return out;
}

// Boolean check -- used where there's no sensible way to "censor" a value
// in place (a username can't become "b****" and still be a usable handle),
// so the caller rejects/replaces it wholesale instead. A fresh RegExp per
// word per call (see wordRegexes), so this is safe to call repeatedly
// without worrying about the g-flag's statefulness across calls.
export function containsBannedWord(text, extra) {
  return wordRegexes(extra).some((re) => re.test(text));
}
