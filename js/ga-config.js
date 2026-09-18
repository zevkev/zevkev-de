// ============================================================================
// Google Analytics 4 Measurement ID — the ONE thing to edit once you have a
// GA4 property. This ID is not a secret (it's meant to be publicly visible
// in every page's source), so it's fine as a plain constant here, no GitHub
// Secret needed.
//
// To get one:
//   1. https://analytics.google.com/ -> Admin -> Create Property.
//   2. Add a "Web" data stream for https://zevkev.de.
//   3. Copy the Measurement ID it shows you (format "G-XXXXXXXXXX").
//   4. On GitHub, open this file (js/ga-config.js), click the pencil/edit
//      icon, paste your ID below instead of the placeholder, commit to main.
// That's it — js/consent.js picks it up automatically. Until a real ID is
// set, analytics stays fully inactive (no script loads, no banner claims
// tracking exists) so nothing here is ever half-configured in production.
// ============================================================================
export const GA_MEASUREMENT_ID = "G-3SRT7NH4XK";
