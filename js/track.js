// Shared analytics tracking client for the private dashboard at
// privat.zevkev.de (see dashboard/ — Cloudflare Pages Functions, built in a
// parallel worktree). Anonymous, no auth, no cookies. The endpoint may not
// be deployed yet, so every path here must fail completely silently: never
// throw, never block/delay anything visible, never spam the console loudly
// enough to alarm a visitor poking at devtools.
//
// Usage:
//   import { track } from "/js/track.js";
//   track("page_view", location.pathname);
//   track("add_to_cart", variantId, qty);
//
// `type` is one of "page_view" | "product_view" | "add_to_cart" | "click" |
// "impression" | "watch_time" (the last one is fired by a separate agent's
// video-player instrumentation, not from this file — track() itself is
// generic and reusable for that too).

const TRACK_ENDPOINT = "https://privat.zevkev.de/api/track";

export function track(type, path, value = null) {
  try {
    const payload = JSON.stringify({ type, path, value });

    // sendBeacon works reliably even during page unload (page_view-on-leave
    // patterns, watch-time heartbeats) and doesn't block navigation. Fall
    // back to a keepalive fetch when it's unavailable or the browser
    // rejects the beacon (e.g. queue full).
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(TRACK_ENDPOINT, blob)) return;
    }

    fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (err) {
    // Never let a tracking failure be visible or affect the page. A quiet
    // console.debug is fine (won't show up in devtools' default log level
    // filters for most visitors); nothing louder.
    console.debug("track() failed silently:", err);
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
