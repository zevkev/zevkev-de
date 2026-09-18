// Shared analytics client — reports events to Google Analytics 4 (see
// js/consent.js, which gates whether window.gtag exists at all: it's never
// defined until the visitor accepts the cookie banner). track() must fail
// completely silently: never throw, never block/delay anything visible.
//
// Usage:
//   import { track } from "/js/track.js";
//   track("page_view", location.pathname);
//   track("add_to_cart", variantId, qty);
//
// `type` is one of "page_view" | "product_view" | "add_to_cart" | "click" |
// "impression" | "watch_time". GA4 already auto-tracks page views on its
// own once loaded, but we still send an explicit one here for consistency
// and so it's not missed on the very first (consent-granting) page load.

export function track(type, path, value = null) {
  trackEvent(type, { event_category: "engagement", event_label: path, value: value ?? undefined });
}

// Lower-level sibling of track() for events that need GA4's own named
// parameters (e.g. "sign_up"/"login" want `method`, not event_label/value) --
// used for the account, watchlist and comment events below. Same silent-
// failure contract as track(): never throws, never blocks anything visible.
export function trackEvent(name, params = {}) {
  try {
    if (typeof window.gtag !== "function") return; // no consent yet, or declined
    window.gtag("event", name, params);
  } catch (err) {
    console.debug("trackEvent() failed silently:", err);
  }
}

// Delegated click tracking: added once, here, when this module first loads
// (any page that imports track.js from anywhere gets this for free). Adding
// tracking to a new element later is just adding a
// data-track-click="some-label" attribute — no new JS needed per element.
document.addEventListener("click", (event) => {
  const el = event.target.closest?.("[data-track-click]");
  if (el) track("click", el.dataset.trackClick);
});

// Fires track("impression", path) once per matched element the first time
// it becomes at least 50% visible in the viewport — meant for video/product
// cards entering view as a grid/shelf scrolls. Unobserves each element right
// after it first fires, so it never double-fires for the same element on
// the same page load. Safe to call repeatedly (e.g. once per re-render of a
// grid) — each call only observes elements currently matching `selector`
// under `root`; elements that already fired and left the DOM are simply not
// matched again.
//
// @param {string} selector - CSS selector for the elements to watch (e.g.
//   ".vod-card[data-video-id]").
// @param {(el: Element) => (string|null|undefined)} pathFn - given a
//   matched element, returns the `path` value to send with the impression
//   (e.g. a video id or product slug). Returning null/undefined skips that
//   element.
// @param {ParentNode} [root=document] - root to run `selector` against.
export function observeImpressions(selector, pathFn, root = document) {
  try {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const path = pathFn(entry.target);
          if (path) track("impression", path);
        });
      },
      { threshold: 0.5 }
    );
    root.querySelectorAll(selector).forEach((el) => observer.observe(el));
  } catch (err) {
    console.debug("observeImpressions() failed silently:", err);
  }
}
