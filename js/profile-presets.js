// Shared, dependency-free data for the profile customization system (bio +
// social link buttons + background preset). Used by both js/account.js
// (editing -- already imports auth.js/Firebase anyway) and js/profil.js
// (the public, read-only page, which deliberately avoids importing
// anything that initializes Firebase Auth beyond what it already needs --
// see that file's own comment on why AVATAR_ICONS is duplicated rather than
// imported from auth.js). This file has zero side effects and no Firebase
// dependency, so both can import it directly instead of duplicating it.

// Icon paths for youtube/instagram/tiktok/discord/twitch are copied
// verbatim from js/layout.js's own ICONS (the already-correct, already-
// verified versions -- notably the Instagram one, which had a real bug
// elsewhere on the site this session from a truncated path; reusing the
// known-good copy instead of risking that again). x/website are new,
// deliberately built from simple primitives (straight lines / a circle)
// rather than a hand-recalled logo silhouette, for the same reason.
export const SOCIAL_PLATFORMS = {
  discord: {
    label: "Discord",
    placeholder: "Einladungscode oder Server-Link",
    icon: '<path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25-1.845-.276-3.68-.276-5.487 0-.163-.393-.406-.874-.618-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.319 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.245.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.834 19.834 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.673-3.548-13.66a.061.061 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.956-2.42 2.157-2.42 1.211 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42m7.974 0c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42"/>',
    fill: true,
    color: "#5865f2",
    urlFor: (v) => (v.startsWith("http") ? v : `https://discord.gg/${v.replace(/^\//, "")}`),
  },
  instagram: {
    label: "Instagram",
    placeholder: "@username",
    icon: '<path d="M7.03.084c-1.277.06-2.149.264-2.911.563-.789.308-1.458.72-2.123 1.388-.665.668-1.075 1.337-1.38 2.127-.295.764-.496 1.636-.552 2.914C.05 8.253.037 8.664.043 11.923c.006 3.259.021 3.667.083 4.947.06 1.277.264 2.148.563 2.911.309.789.72 1.457 1.388 2.123.668.665 1.337 1.074 2.129 1.38.763.295 1.636.496 2.913.552 1.277.056 1.689.069 4.947.063 3.257-.006 3.667-.021 4.947-.081 1.28-.061 2.147-.266 2.91-.564.789-.309 1.458-.72 2.123-1.388.665-.668 1.074-1.337 1.379-2.129.296-.763.497-1.636.552-2.912.056-1.281.069-1.69.063-4.948-.006-3.258-.021-3.667-.082-4.947-.06-1.28-.264-2.149-.563-2.912-.309-.789-.72-1.457-1.387-2.123C21.298 1.33 20.628.92 19.838.616 19.074.32 18.202.119 16.924.064 15.647.009 15.236-.005 11.977.001 8.718.007 8.31.022 7.03.084M7.17 21.776c-1.17-.051-1.805-.245-2.229-.408-.56-.216-.96-.477-1.382-.895-.422-.418-.681-.819-.9-1.378-.164-.423-.362-1.058-.417-2.228-.06-1.264-.072-1.644-.079-4.848-.007-3.204.005-3.583.061-4.848.05-1.169.246-1.805.408-2.228.216-.561.476-.96.895-1.382.419-.422.818-.681 1.378-.9.423-.165 1.057-.361 2.227-.417 1.265-.06 1.644-.072 4.848-.079 3.203-.007 3.583.005 4.848.061 1.169.053 1.805.246 2.228.408.56.216.96.475 1.382.895.422.419.681.818.9 1.378.165.422.361 1.056.417 2.226.06 1.265.074 1.645.079 4.848.005 3.203-.006 3.584-.062 4.848-.052 1.17-.246 1.805-.408 2.229-.216.56-.477.96-.895 1.382-.419.421-.818.68-1.378.899-.422.165-1.058.362-2.226.418-1.265.06-1.645.072-4.849.079-3.204.007-3.582-.006-4.848-.062M15.947 5.586a1.44 1.44 0 1 0 1.437-1.442 1.44 1.44 0 0 0-1.437 1.442M5.839 12a6.161 6.161 0 1 0 12.323-.001 6.161 6.161 0 0 0-12.323.001M8 12a4 4 0 1 1 4 4 4 4 0 0 1-4-4"/>',
    fill: true,
    color: "#d6249f",
    urlFor: (v) => `https://instagram.com/${v.replace(/^@/, "")}`,
  },
  youtube: {
    label: "YouTube",
    placeholder: "@kanal",
    icon: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
    fill: true,
    color: "#ff0000",
    urlFor: (v) => (v.startsWith("http") ? v : `https://youtube.com/${v.replace(/^@?/, "@")}`),
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@username",
    icon: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
    fill: true,
    color: "#000000",
    urlFor: (v) => `https://tiktok.com/@${v.replace(/^@/, "")}`,
  },
  twitch: {
    label: "Twitch",
    placeholder: "username",
    icon: '<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>',
    fill: true,
    color: "#9146ff",
    urlFor: (v) => `https://twitch.tv/${v.replace(/^@/, "")}`,
  },
  x: {
    label: "X (Twitter)",
    placeholder: "@username",
    icon: '<path d="M4 4l16 16M20 4 4 20"/>',
    fill: false,
    color: "#000000",
    urlFor: (v) => `https://x.com/${v.replace(/^@/, "")}`,
  },
  website: {
    label: "Website",
    placeholder: "deine-seite.de",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9z"/>',
    fill: false,
    color: "#4a7c9e",
    urlFor: (v) => (v.startsWith("http") ? v : `https://${v}`),
  },
};

// Solid/gradient mat backgrounds a visitor can pick for their own profile
// page, matching the site's existing cutting-mat aesthetic (see --blue-mat
// in style.css) rather than introducing a clashing pattern or photo.
// "default" isn't in this map on purpose -- profil.js falls back to the
// page's own normal mat when a profile has no background set (or an
// unrecognized/legacy key), so removing a preset later can't strand
// existing profiles on a blank page.
// Solid colors only, deliberately -- js/profil.js applies the chosen value
// by overriding the --blue-mat custom property that body's own
// background-color already uses (see that file's comment), so every one of
// the site's existing grid/texture layers keeps working unmodified on top
// of it. A gradient would silently fail there (background-color never
// accepts one), so "Sonnenuntergang" is a warm solid instead of the
// literal gradient its name might suggest.
export const BACKGROUND_PRESETS = {
  blau: { label: "Blau", value: "#234d70" },
  petrol: { label: "Petrol", value: "#1c5a5a" },
  bordeaux: { label: "Bordeaux", value: "#5a1c2e" },
  wald: { label: "Wald", value: "#1f4d2e" },
  sonnenuntergang: { label: "Sonnenuntergang", value: "#8a4a2e" },
  mitternacht: { label: "Mitternacht", value: "#0b0f16" },
};

export const BIO_MAX_LENGTH = 160;
