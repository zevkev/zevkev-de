// Shared scroll-reveal for .reveal elements (style.css's .reveal/.reveal.is-visible
// pair: opacity 0 -> 1 snap + a 0.5s slide-up on transform, see that file's own
// comment on why opacity itself isn't in transition-property).
//
// Real bug this replaced: only the homepage (via js/home.js's own inline
// initReveal(), called once at module load) and, by a fragile side effect,
// the shop/product pages (which dynamically `import("/js/home.js")` purely
// to trigger that same one-time call) ever actually wired an
// IntersectionObserver up to add .is-visible. Every other page that reused
// the .reveal class on dynamically-rendered cards (js/youtube.js,
// js/vods.js, js/watchlist.js, js/account.js's watchlist preview) never
// triggered it at all -- those pages only ever looked "revealed" because
// css/shop.css's .product-card and css/vods.css's .vod-card additionally
// carried their own `animation: fadeUp 0.5s ease both;`, which fires
// immediately on insertion regardless of scroll position. That's what made
// every one of those pages look static once you'd scrolled past the very
// top: everything below the fold had already faded in before you ever saw
// it, instead of animating in as each card actually entered the viewport.
// Removed that redundant per-page animation; this is now the one real
// reveal mechanism everywhere.
//
// Exported (not just run once like the old inline version) specifically so
// a page can call it again after rendering NEW .reveal elements -- a filter
// switch, a sort change, "load more", a fresh product page -- since a
// one-time scan at module-load time only ever catches whatever already
// existed in the DOM at that exact moment. Safe to call repeatedly: already
// -revealed elements are excluded by the :not(.is-visible) selector, and
// re-observing an element that's still pending its first reveal is
// harmless (whichever observer instance sees it first adds the class and
// unobserves itself; a second one doing the same afterwards is a no-op).
export function initReveal(root = document) {
  const items = root.querySelectorAll(".reveal:not(.is-visible)");
  if (!items.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => io.observe(el));
}
