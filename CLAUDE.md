# ZevKev Website — Project Memory

Read this file first. It exists so you don't have to read the whole codebase to
orient yourself — only read the specific files a task actually touches.

## What this is

Static vanilla HTML/CSS/JS site (ES modules, **no build step**) for Kevin
Kliver ("ZevKev"), a German theme-park/vlogs YouTuber and Twitch streamer
(`zevkev_`). Deployed to **zevkev.de** via GitHub Pages + GitHub Actions.
Repo: `github.com/zevkev/zevkev-de`.

Visual identity: a "torn paper craft" design system — torn-edge cards via
CSS `clip-path`, a cutting-mat background, hand-made/scrapbook feel. No
emojis, no em-dashes in copy. All UI copy is German, casual-friendly tone.

## Architecture map

| Path | What it is |
|---|---|
| `css/style.css` | Core design system: CSS custom properties, dark mode via `:root[data-theme="dark"]`, shared components (`.rip` torn cards, buttons, nav, cart drawer, quick-view chrome) |
| `css/{shop,vods,youtube,home,legal}.css` | Page-specific additions, loaded alongside style.css |
| `js/layout.js` | Shared header/footer/nav/cart-drawer shell, mounted on every page via `mountLayout()` |
| `js/theme.js` | Dark-mode detection + toggle button, persisted to localStorage |
| `js/twitch-toggle.js` | `TWITCH_ENABLED` boolean — the master on/off switch for all Twitch features, deliberately isolated in its own file for easy direct GitHub web-UI edits |
| `js/config.js` | Public tokens (Fourthwall storefront token, Twitch client ID) — re-exports `TWITCH_ENABLED` |
| `js/cart.js` + `js/fourthwall-api.js` | Cart state + Fourthwall Storefront API client |
| `js/catalog.js` | Shop grid — cards navigate to `/shop/<slug>`, a real product page (no more quick-view modal) |
| `js/product.js` + `shop/product/index.html` | Product detail page. Reads the slug from `?slug=` or (when there's none) the URL path, so it renders identically whether loaded at `/shop/product/?slug=<slug>` or via `404.html`'s clean-URL fallback (see `404.html` below) |
| `404.html` (repo root) | GitHub Pages' standard clean-URL workaround (no server-side rewrites on this host): served site-wide for any unmatched path. Detects `/shop/<slug>` and mounts `js/product.js` to render that product; anything else gets a plain generic 404. Must stay at the repo root — GitHub Pages only honors one, and only there |
| `js/currency.js` | Pure `money(amount, currency)` price formatter (Intl.NumberFormat, `de-DE`). No conversion logic — `js/fourthwall-api.js` requests every price directly in EUR from Fourthwall itself (see its own entry below), so there's nothing left to convert here |
| `js/vods.js` + `js/twitch-auth.js` | Mehr/ZevKev+ page: live > Twitch VOD > YouTube fallback player in the hero (via `YT.Player`/`Twitch.Player` SDKs for watch-time, not bare iframes), Twitch OAuth popup login + chat. Archive/spotlight/YouTube-VOD-channel cards all link to real `/vod/<id>/` or `/video/<id>/` pages (see `js/watch.js`) — no modal |
| `js/youtube.js` | YouTube page: Videos/Shorts grid. Cards link to `/video/<id>/` (`js/watch.js`) — this page used to open videos in an on-page modal, but every video/VOD now gets a real page with comments instead, so don't assume "modal" from an old memory of this page |
| `js/watch.js` + `shop/product/index.html`'s `404.html`-fallback sibling pattern | Shared single-video page for both `/video/<id>/` (YouTube) and `/vod/<id>/` (Twitch VOD) — served via `404.html`'s clean-URL fallback exactly like `js/product.js`/`/shop/<slug>`. Player + meta + comments (`js/comments.js`) + watchlist + resume-progress (`js/user-data.js`). Twitch VODs get a "Chat-Replay auf Twitch ansehen" outbound link instead of an embedded chat — Twitch's embed API doesn't support VOD chat replay, confirmed against their docs, so linking out is the honest option rather than faking a broken embed |
| `js/watchlist.js` | Dedicated Watchlist page — reads the shared `zevkev-watchlist` key, resolves ids against both `videos.json` and `main-videos.json` |
| `js/track.js` | Analytics client. Exports `track(type, path, value)` and `observeImpressions(selector, pathFn, root)` (IntersectionObserver, fires once per element) — both report via `window.gtag(...)`, silently no-op if `gtag` isn't defined (i.e. no consent yet). Wired into `layout.js` (page_view), `product.js` (product_view), `cart.js` (add_to_cart), various `data-track-click` attributes (click), video-card grids in `vods.js`/`youtube.js` (impression), and watch-time heartbeats from the player-embedding code itself |
| `js/consent.js` + `js/ga-config.js` | Cookie consent banner (GDPR: GA4 never loads before explicit accept) + the GA4 Measurement ID (not a secret, plain file, currently a placeholder — see "Known issues"). `js/consent.js` also exports `openConsentSettings()`, wired to a "Cookie-Einstellungen" footer link so a visitor can change their mind later |
| `scripts/fetch-main-feed.mjs` | Fetches full YouTube upload history via Data API v3. `YOUTUBE_API_KEY` **is** now a real GitHub repo secret (added by Kevin 2026-09-18, confirmed working via a manual `workflow_dispatch` run — see "Already done"). Shorts classification is a plain duration cutoff (`isShort = durationSeconds < 120`, see `SHORT_MAX_SECONDS`) computed from `videos.list`'s `contentDetails.duration` — no network probe. Used to probe `youtube.com/shorts/<id>` for YouTube's own retroactive tag instead, but that missed pre-Shorts-era short uploads that never got tagged; switched 2026-09-17 per Kevin's explicit ask ("all videos under 2 minutes should be put in shorts") |
| `scripts/fetch-twitch-status.mjs`, `fetch-vod-feed.mjs` | Twitch live status + VOD archive fetch |
| `.github/workflows/data-refresh.yml` | Cron (every 5 min): runs the fetch scripts, commits data back via `github-actions[bot]` |

## Conventions

- Dark mode: define light values in bare `:root`, dark overrides in
  `:root[data-theme="dark"]`. Toggle sets `data-theme` on `<html>`.
- **Buttons don't inherit text `color` from ancestors** (browser default) —
  always set `color` explicitly on custom buttons, or they render black
  regardless of theme. This exact bug hit `.cart-close`, `.swatch-size`,
  `.qty-stepper button`/`input` — same root cause every time.
- **Recurring dark-mode bug pattern, found repeatedly across a whole site
  sweep (2026-09-22): a hardcoded hex color used as text, with no
  `:root[data-theme="dark"]` override.** It looks fine in light mode
  (coincidence, not correctness) and goes low/zero-contrast once `--paper`
  turns near-black in dark mode. Hit `.legal-sheet a`, `.consent-banner a`,
  `.account-name-saved`, `.shop-campaign-code`, the homepage hero's inline
  `style="color:#0f4c81"` links, and `.note-accent-d`/`.note-accent-t`
  (`--discord-blurple-dark`/`--twitch-purple-dark` used as *text*, not
  background — those two tokens are deliberately muted for light-mode
  paper and were never meant to double as dark-mode-safe text colors).
  When adding any new colored text, either use an existing `--text-*`/
  `--accent-*` token (already theme-aware) or add an explicit
  `:root[data-theme="dark"]` override scoped to that selector — don't
  reuse a `*-dark`-suffixed token as text color, that suffix means
  "muted/background", not "dark-mode-safe".
- Modals reuse `.cart-backdrop` / `.qv-panel` / `.qv-close` chrome. Both the
  shop's old quick-view modal AND the YouTube/VODs pages' old video-player
  modals are gone now — every product and every video/VOD gets a real page
  (`js/product.js`+`/shop/<slug>`, `js/watch.js`+`/video|vod/<id>/`) instead,
  all served via the same `404.html` clean-URL fallback trick. `js/product.js`
  still reuses the `.qv-*` class names for its lightbox/gallery/option pieces
  even though it's no longer a modal. If you're about to build a new modal,
  first ask whether this page actually wants one — the established direction
  this whole site has moved in is "give it a real page instead" (shareable
  URL, comments, SEO), not modals.
- Cork product-photo texture (`--photo-mat`) is an SVG `feTurbulence` noise
  filter (not gradients — those tile visibly). If you touch it: keep
  `stitchTiles="stitch"` AND pin the filter region explicitly
  (`x/y/width/height` + `userSpaceOnUse` on both `<filter>` and
  `<feTurbulence>`) or the noise doesn't actually wrap seamlessly at the
  tile edge. Keep contrast low and frequency high — a punchier version
  read as "melted cheese" or harshly rough; real cork is smooth and even.

## Already done — don't redo, just verify still intact

- Cork texture: rebuilt as SVG feTurbulence noise, seam bug fixed, contrast
  recalibrated against a reference photo the user provided. Considered
  correct as of the last commit touching it. Just confirm it still renders
  cleanly (both themes, grid + quick-view) after other changes — don't
  redesign it again.
- Quick-view backdrop: changed to fully transparent
  (`#quick-view.cart-backdrop { background: transparent; }` in style.css)
  per explicit request — no dimming overlay, the panel sits directly on
  the undimmed page. The cart drawer's own backdrop (`#cart-backdrop`,
  a different element) is unaffected and still dims normally.
- Social share: `og:image`/`twitter:image` added to home/shop/vods/youtube
  (all previously missing one, so shared links showed no preview image).
- Impressum: USt-IdNr line removed (confirmed with Kevin: no Gewerbe, no
  real number to list), Fourthwall returns-policy link added.
- Cart empty-state bug: `refreshFromApi()` used to skip `render()` entirely
  when no cart existed yet, so first-time visitors saw a blank panel
  instead of the empty-state design. Fixed.
- Quick-view: empty product descriptions no longer leave a double-divider
  gap; add-to-cart is confirmed working end-to-end (the real bug was
  Fourthwall blocking PUT/PATCH/DELETE at their edge — fixed via their
  actual POST-based `/add /change /remove` endpoints).
- **Size-selection was investigated as a reported bug and turned out to be
  a false alarm** — see Testing caveat #2 below. The actual click handling
  in `js/catalog.js` is correct; don't re-investigate this from scratch.
- **VODs and YouTube page redesigns**: reviewed, tested in-browser (light/
  dark, desktop/mobile) and committed in separate commits. Twitch archive
  grid, spotlight, sort toggles, custom video modals — all working.
  `js/twitch-auth.js`'s DOM hooks untouched.
- **Video/photo modal close buttons**: were a real bug, not a false alarm —
  the shop lightbox, YouTube modal and Twitch modal all used a translucent
  white circle (`rgba(255,255,255,.15)`) that disappeared against bright
  content. Fixed on all three to a solid dark backdrop
  (`rgba(10,10,14,.6)`). This was the repeated "man sieht das X kaum"
  complaint — considered resolved now.
- **Dark/light theme toggle — investigated, not actually broken.** The
  toggle mechanism (`js/theme.js`'s `toggleTheme()`, the `data-theme`
  attribute, localStorage persistence, the header icon swap in
  `js/layout.js`) all work correctly — verified by checking
  `document.documentElement.dataset.theme` and `localStorage` directly
  before/after a real click. The site's "cutting mat" background
  (`--blue-mat`) is a dark navy in **both** themes by design (`#234d70`
  light / `#060c14` dark) — only paper cards, text and chrome actually flip
  between cream and charcoal. If this still gets reported as "broken," the
  real ask is probably a visual design change (e.g. a genuinely light mat
  in light mode), not a functional fix. Kevin kept reporting it as broken
  after being told this, so as of the 2026-09-17 VOD/YouTube ground-up
  redesigns, both pages were told to make their own light theme genuinely
  lighter locally (not by touching the shared `--blue-mat`) — check whether
  that actually landed and reads as "obviously different now" before
  assuming this is still open.
- **Watchlist page — done.** New `/watchlist/` page (`js/watchlist.js`,
  `css/watchlist.css`, `watchlist/index.html`), added to both the header
  nav (`js/layout.js` `NAV`) and footer links. Reads the shared
  `zevkev-watchlist` key and resolves ids against both `videos.json` and
  `main-videos.json`, tagging each card with a source badge. Verified
  in-browser with a real saved id.
- **Shop: product click now opens a real page, not the quick-view modal.**
  `js/catalog.js`'s cards navigate to `/shop/<slug>`; `js/product.js` +
  `shop/product/index.html` render the page (swatch/gallery/stock/qty/
  add-to-cart logic ported close to as-is from the old modal). Clean URLs
  work via `404.html` at the repo root (GitHub Pages' standard workaround
  for pretty URLs on a host with no server-side rewrites — served site-wide
  for any unmatched path, HTTP status is a 404 even though the page renders
  normally, a known/accepted tradeoff of this technique). The older
  `/shop/product/?slug=<slug>` form still works (`js/product.js` reads
  either the query string or the URL path).
- **Shop prices now show EUR, not USD.** Fourthwall's Storefront API always
  returns USD (root cause — no setting changes that); `js/currency.js`
  fetches/caches a USD→EUR rate from `assets/data/exchange-rate.json`
  (written by `scripts/fetch-exchange-rate.mjs`, cron'd in
  `data-refresh.yml`, same pattern as the video-feed fetchers) and converts
  before formatting. Falls back to showing the original USD amount if that
  file is ever missing/unreachable, rather than crashing. Separately:
  `js/cart.js`'s `checkoutUrl()` now passes `cartCurrency=EUR` (was `USD`,
  the API's own cart currency) to Fourthwall's hosted checkout — verified
  directly against a real test cart that this actually switches the
  checkout's displayed order-summary currency (confirmed via Fourthwall's
  own already-enabled "Local currencies" EUR support), whereas `USD` or no
  param at all both showed USD even for a Germany-detected visitor.
- **Post-redesign bug pass (2026-09-17), all fixed:**
  - VODs chat column now fully collapses (`display:none`, no placeholder
    note) when offline instead of showing a "chat only during live streams"
    panel — the player (`flex:1`) reclaims the full hero width.
  - **The shared `.rip::before` torn-paper background no longer has a grain
    image at all** (solid `--paper` color only). First tried scoping the
    fix to just `.p-btn` (assuming the moire was a small-element problem),
    but Kevin reported the identical grid-like pattern on the large
    homepage hero card too — disproving that assumption. A tiled fine-noise
    JPEG (`paper-grain.jpg`, multiply-blended) is just generally moire-prone
    regardless of element size, varying with zoom/DPI. Removed at the root
    (`.rip::before` in `style.css`) instead of per-component. `.rip--photo`
    (cork/product-photo texture) is a completely separate recipe — SVG
    `feTurbulence`, not a tiled JPEG — and is unaffected; don't add a grain
    *image* back to the base `.rip::before` without solving the tiling/
    moire problem first (e.g. a much larger tile size, or switching to a
    procedural noise approach like `.rip--photo` already uses).
  - Mobile hero scaling on `/vods/` and `/youtube/`: plain `vh` units are
    sized against the largest-possible mobile viewport (as if the address
    bar were permanently hidden), not the real visible one — caused
    overflow/clipping on some phones. Added `dvh` as a second declaration
    after each `vh` value (silently ignored by browsers without `dvh`
    support, so the old value stays as fallback).
  - **Real regression, worth remembering**: the YouTube gronkh.tv
    restructure deleted the base (unscoped) `.yt-section-title` rule in
    `css/youtube.css` while restructuring that file's own library section
    — despite a comment right next to the deletion still describing it as
    present. VODs' "Die neusten Streams"/"Aus dem Archiv"/"Vom YouTube VOD
    Kanal" headings depend on that exact class for their color (fixed
    white, since they sit directly on the dark mat, not a paper section).
    Without it they fell back to inherited body text color, which is
    near-black in light theme — nearly invisible on the dark mat, but
    happened to still look fine in dark theme (where the inherited color
    is already light), which is why it wasn't caught during initial
    testing. **Lesson**: when one page's CSS file also supplies shared
    classes for another page (see the header comment in `css/youtube.css`
    itself), a restructure of that file needs to grep the OTHER page's
    HTML/JS for class usage before deleting anything that looks unused
    locally — test the borrowing page too, not just the one being redesigned.
  - YouTube page's mobile nav dropdown text was unreadable in light theme
    (white text forced by `body.yt-page:not(.yt-scrolled) .site-nav a` —
    meant for the desktop transparent-bar-over-hero look — landing on the
    dropdown's own solid `--paper-accent` panel below 700px). Scoped that
    rule to `@media (min-width: 701px)` to match `style.css`'s own mobile
    breakpoint for the dropdown.
- **Analytics: Google Analytics 4, not the Cloudflare dashboard (reversed
  2026-09-17).** A full Cloudflare-based dashboard (D1, Pages Functions,
  password-gated frontend) was built earlier the same day, then explicitly
  discarded when Kevin decided he'd rather use GA4 + the GA mobile app
  than maintain a second Cloudflare-hosted site — `dashboard/` is gone,
  don't recreate it without being asked again. In its place: `js/consent.js`
  (cookie banner, GA4 never loads before accept — verified in-browser that
  Decline persists and blocks `gtag` entirely, Accept persists, and the
  footer's "Cookie-Einstellungen" link reopens the banner) and `js/ga-config.js`
  (the Measurement ID — still a placeholder, see "Known issues"). `js/track.js`
  keeps its exact same `track()`/`observeImpressions()` call sites from the
  Cloudflare version (nothing in the calling code changed) but now reports
  via `gtag()` — the "no-op if unavailable" design doubles as the consent
  gate for free. Watch-time still required switching the YouTube/Twitch
  embeds from bare `<iframe>`s to each platform's JS Player SDK
  (`YT.Player`/`Twitch.Player`) so play/pause events are observable —
  verified in-browser that playback, the modal, and the close button all
  still work, and separately verified the Twitch chat login button still
  correctly opens the real `id.twitch.tv` OAuth popup after that change.
  Datenschutzerklärung's Google Analytics section was rewritten to match
  (was previously a "we don't use Google Analytics" line — now accurate).
- **Texture-bleed fix re-verified after a follow-up report.** Kevin
  reported the same grid-moire pattern again after the `.rip::before`
  fix had already shipped; re-checked the live site (not the local
  dev-preview) with a forced CSS cache-bust and it rendered clean,
  matching his own screenshot pixel-for-pixel. Almost certainly his
  browser/CDN showing a stale cached stylesheet from before the fix
  deployed, not a regression — if it comes up again, get a fresh
  screenshot AFTER confirming the fix commit is actually live (`git
  merge-base --is-ancestor <fix-commit> origin/main`) before
  re-investigating from scratch.
- **Basic on-page SEO pass.** Person + WebSite JSON-LD on the homepage
  (with `sameAs` to the real YouTube/Instagram/TikTok/Twitch profiles —
  this is the main lever for a branded "zevkev" search reliably
  surfacing this domain), `<link rel="canonical">` on every main page
  and dynamically on the shop product page (pointing at the clean
  `/shop/<slug>` form regardless of which URL form served it), and
  `/watchlist/` added to `sitemap.xml` (was missing since it shipped).
  This is a ceiling-raiser, not a guarantee — actual ranking also
  depends on backlinks, competition, and how long the site's been
  indexed, none of which a code change controls. Don't imply to Kevin
  that a #1 ranking is now assured.
- **Actual root cause of the texture-bleed complaint, found after three
  earlier fixes addressed real-but-secondary bugs.** `.reveal.is-visible`
  used to run `animation: fadeUp 0.6s ease forwards`, interpolating
  `opacity` 0->1 alongside the slide-up — every card was genuinely
  semi-transparent for that whole 0.6s while scrolling into view,
  letting the body's grid/dot mat texture show through blended with
  the card underneath, on every load and every scroll. A screenshot
  taken after waiting (the natural instinct) would never catch this —
  it only exists during the transition. Fixed in `css/style.css`: opacity
  is no longer in `transition-property`, so it snaps instantly instead of
  interpolating (verified by sampling computed opacity across animation
  frames — jumps straight 0 to 1, never partial), while the slide-up still
  animates smoothly via `transform` alone. If a "something bleeds through
  during page load/scroll" report ever comes up again for a *different*
  element, check for this same opacity-interpolation pattern first.
- **Nav label "VODs" renamed twice: first to "Streams", then to "Mehr"**
  (`js/layout.js`'s `NAV` array, footer link, `vods/index.html`'s
  `<title>`/`og:*`) — Kevin asked for the rename again after "Streams"
  shipped, explicitly requesting "Mehr" specifically. Current state: label
  is **"Mehr"**. URL path (`/vods/`) deliberately unchanged both times, so
  none of the SEO/canonical/sitemap work breaks. The nav-item-to-attribute
  wiring in `headerHTML()` now keys off `n.href === "/vods/"` instead of
  matching the label string, specifically so a future rename doesn't
  silently break the `data-twitch-optional` attribute again. Verified via
  direct `curl`/`fetch()` of the served file plus an in-browser check after
  forcing a fresh module load (the browser tool's module/document cache
  wouldn't show it otherwise — see Testing caveat #1).
- **Watchlist nav item now hides itself when the watchlist is empty**
  (`js/layout.js`: `hasWatchlistItems()` checks the shared
  `zevkev-watchlist` localStorage key; the nav link and the footer link
  — `#footer-watchlist-link` — are removed from the DOM in `mountLayout()`
  when it's empty). Per-page-load check, not reactive — adding something to
  the watchlist makes the nav item appear on the *next* page load, not
  instantly on the page you added it from. Verified in-browser with an
  empty watchlist (both links absent) since the actual saved-item case
  was already covered by the original Watchlist-page verification above.
- **Homepage texture-overlap bug: a third, distinct root cause from the
  `.reveal` opacity one above, found 2026-09-17 after Kevin kept reporting
  the dot/stripe texture sitting "in front of" the hero card/buttons/
  Discord section specifically on the homepage.** `css/home.css` had a
  single `body.home::before` texture layer *explicitly* set to
  `z-index: 3`, one higher than `.zone`'s `z-index: 2` — a deliberate
  earlier decision (see the old comment this replaced) to avoid the
  texture being fully hidden behind each zone's opaque background color,
  which instead put it above every real page element. Fixed by baking the
  same texture directly into each `.zone`'s own `background-image` (as
  additional layers alongside each zone's existing color/gradient) instead
  of a separate stacked pseudo-element — a background always paints below
  its own element's children regardless of any z-index anywhere else, so
  this class of bug can't recur here. `background-attachment: fixed` on
  just the texture layers (not each zone's own color/gradient, which stays
  `scroll`) keeps the pattern continuous across zone boundaries without a
  seam, preserving the reason the shared layer existed in the first place.
  Verified with a forced fresh-CSS reload (not just curl) showing the dots
  rendering outside/behind the hero card, never on top of it.
- **Full YouTube upload history fetched, and automation confirmed working
  end-to-end (2026-09-18).** `assets/data/main-videos.json` has 206 videos
  (52 regular + 154 Shorts under the new duration cutoff — see the
  `scripts/fetch-main-feed.mjs` row above). `YOUTUBE_API_KEY` **is** now a
  real GitHub repo secret — Kevin added it himself in the browser (never
  typed into any field by the assistant, per the hard credential rule).
  Verified live: manually triggered `data-refresh.yml` via
  `workflow_dispatch` (run #16), confirmed its "Fetch YouTube main channel
  feed" step logged `Wrote 206 videos (154 shorts, <120s)`, and confirmed
  the bot's follow-up commit landed on `origin/main`. The 5-minute cron
  will keep this current on its own from now on — no more "check whether
  Kevin added the secret yet" caveat needed.
- **Fourthwall prices now match checkout exactly, because there's only
  one conversion happening instead of two (2026-09-18).** Root cause of
  the "price on the site doesn't match Fourthwall's checkout" report:
  the site fetched USD prices from Fourthwall and converted them to EUR
  itself using a separately-fetched ECB rate (`scripts/fetch-exchange-
  rate.mjs`), while checkout applied *Fourthwall's own* USD→EUR
  conversion — two independent rates, so the two numbers could legitimately
  differ. Fixed by requesting `currency=EUR` directly on every Storefront
  API call (`js/fourthwall-api.js`) — Fourthwall returns prices already
  converted using the exact rate checkout will charge, so `js/currency.js`
  is now a pure formatter with no conversion logic at all.
  `scripts/fetch-exchange-rate.mjs`, its `data-refresh.yml` step, and
  `assets/data/exchange-rate.json` are gone — nothing reads a client-side
  rate anymore. Verified live: a direct Storefront API call returned
  `{ currency: "EUR", value: 14.8 }` for a product, confirming the param
  is honored. Also added a plain "Preise inkl. MwSt., zzgl.
  Versandkosten." / "zzgl. Versandkosten" note on the shop page, the
  product page and the cart drawer per Kevin's request — Fourthwall
  calculates real shipping at their own checkout, this site never has that
  number to show upfront.

- **Twitch on/off toggle (`/privat/`) actually self-corrects live now
  (2026-09-22).** Root cause of "doesn't save": it always wrote to
  Firestore (`settings/site.twitchEnabled`) correctly and every consumer
  already read the same `js/config.js` override, but `js/flags.js` only
  ever refreshed the localStorage cache for the *next* page load, and
  `js/privat.js` swallowed write failures with a bare `console.error` — so
  a real save and a silent permission failure looked identical, and even a
  successful toggle needed two reloads to visibly change. Fixed:
  `js/flags.js` now corrects `<html class="twitch-disabled">` live the
  moment its background Firestore check finds a stale value (not just the
  cache) and fires a `zevkev:twitch-flag-updated` event; `js/privat.js`
  updates the same cache key immediately after a successful write and
  shows a visible error in the settings UI on failure; `js/vods.js`/
  `js/live.js` listen for that event and reload, since their `init()`
  branches on `TWITCH_ENABLED` once at load time (can't hot-swap a live
  Twitch/YouTube player mid-render safely). Firestore rules for
  `settings/site` are console-managed (no rules file in this repo) — if
  a future error surfaces there, that's a Firebase Console rules check,
  not another client-side latency bug.
- **Mehr/ZevKev+ page: closed the remaining visual gaps vs. the YouTube
  page, and fixed a real hero-overlap bug (2026-09-22).** Hero title now
  uses Bebas Neue, section headings are integrated with their filter/sort
  pills in one `.yt-library-head` row instead of stacked separately, "Aus
  dem Archiv" uses the lighter `.yt-spotlight-label` treatment, cards got
  the same play-circle hover affordance, and the YouTube-VOD-channel grid
  gained a Neueste/Älteste sort + load-more (that feed, `videos.json`, has
  no view-count field at all, unlike `main-videos.json` — that's why it's
  date-sort only, not Neueste/Meistgesehen like the YouTube page's). Real
  bug also found and fixed: the hero's nav floats transparently over the
  full-bleed video (works fine for a plain background image, which is all
  `css/youtube.css`'s own hero ever shows), but YouTube's *embedded iframe*
  draws its own native title/channel overlay in the top-left corner while
  paused — landing directly under the nav. No CSS can reach into a
  cross-origin iframe to move it, so the player is now offset by
  `var(--header-h)` instead (see `.vod-hero-player .player-wrap`'s comment
  for why `padding-top` on the parent does NOT work for this — an
  absolutely-positioned `inset:0` child fills the *padding box*, whose
  top-left corner sits at the border edge regardless of padding; the fix
  needed an explicit `top: var(--header-h)` on the child itself instead).
- **Shop: hover-swap-to-second-photo, tap-to-flip for touch, and several
  real bugs fixed in one pass (2026-09-22).** Product cards crossfade to
  the product's second photo on hover (`product.images[1]`, same field
  `js/product.js`'s own gallery already reads) — and, since `:hover` never
  fires on touch, an explicit tap-to-flip button (bottom-left of the
  photo) does the same thing on any device. Product detail page now
  surfaces Fourthwall's `additionalInformation` (material/fit,
  guarantee/returns) and `sizeGuide` fields — fetched by the API already,
  never rendered before — as a details accordion (confirmed live shape via
  Fourthwall's own docs: `sizeGuide` is `{url, content}`). Removed the "All
  Products" filter pill (Fourthwall's own built-in catch-all collection,
  same one the hardcoded "Alle" pill already shows — two identical filters
  side by side). Hero header (title/description/shipping note) is one
  paper card now instead of plain text on the mat, with the campaign promo
  banner as an inset dashed strip inside it instead of a second floating
  `.rip` card (two nested torn-paper shapes clip against each other —
  don't nest `.rip` inside `.rip`, use a plain tinted panel for an "inset
  highlight" instead, see `.shop-campaign-banner`/`.info-accordion`).
  Product photo frame got a chipped/torn edge (`clip-path: var(--tear-b)`)
  instead of a stark rectangle — outline only, the cork grain recipe
  itself is untouched (see "Do not" below, still applies).
- **Homepage: fixed the dark-mode contrast bugs above, plus the "Deine
  Hosts" team cards (2026-09-22).** The Jamon/Belloflo website-link buttons
  (`.p-btn.rip`) sat on the *exact same* `--paper` tone as their parent
  `.c-card`, so the "button" had no visible edge or background at all —
  looked like bare text with nothing under it, not a design choice.
  Recolored to `rip--accent`. Host cards also gained tape strips (same
  pinned-to-the-board cue as `.zone-sheet`/`.how-accordion` elsewhere on
  this page) and a hover lift that preserves each card's own tilt instead
  of snapping flat.
- **Footer's "Cookie-Einstellungen" is a real `<button>` now, not
  `<a href="#">` (2026-09-22).** Was the classic `href="#"`-as-click-target
  anti-pattern. Styled as its own small bordered pill with an icon, moved
  out of `.footer-links` into its own line — if you touch `js/layout.js`'s
  `mountOwnerNav()` again, note its "Privat" footer link now just
  `appendChild`s (it used to `insertBefore(..., cookie-settings-link)` as
  an anchor to stay last in that row; now that the button lives outside
  `.footer-links` entirely, that `insertBefore` would throw — the
  reference node has to be a real child of the container you call it on).

## Known issues / next fixes (as of 2026-09-17)

- [ ] **Full CSS modularization — each page fully self-contained, not
      dependent on `css/style.css`.** Explicit architecture change request:
      right now every page loads `style.css` (shared tokens, `.rip` cards,
      buttons, nav, cart drawer, modal chrome) plus its own page CSS
      (`shop.css`/`vods.css`/`youtube.css`/`home.css`/`legal.css`) on top.
      The ask is to stop sharing a main stylesheet at all — each page
      (YouTube, VODs/Twitch, Shop, Home, legal pages) gets its own complete,
      independent CSS file with everything it needs, nothing pulled from a
      shared file. This is a real tradeoff, worth being upfront about
      rather than silently reinterpreting: it means duplicating shared
      component styles (buttons, cards, nav, footer, cart drawer, dark-mode
      CSS custom properties) across every page's file, which trades "fix a
      shared bug once" for "each page is truly independent." The
      `.cart-close` color-inheritance bug this session (fixed in one place,
      benefited every page) is a concrete example of what gets harder. If
      the instruction is taken literally, do it literally — but flag this
      tradeoff back to Kevin once, don't just silently duplicate everything
      without saying so. A middle ground worth proposing: keep only the
      genuinely global primitives (color tokens, font-face declarations)
      in one minimal shared file, make every actual component/page style
      local to that page — ask which one is actually wanted if unsure.
- [ ] **Quick-view bottom-edge complaint — likely moot now, verify.** This
      was about the *modal's* torn paper edge cutting off against the
      undimmed page behind it. Since the shop quick-view modal is gone
      (replaced by the real product page — see "Already done"), this
      specific complaint has no more surface to apply to on the shop side.
      Worth a quick visual check that nothing similar shows up on the new
      product page, but don't treat this as still-open work on its own. If
      any modal/overlay pattern remains anywhere (e.g. the video player
      modals), keep this in mind: a transparent backdrop only reads as
      "clean, not dimmed" when the foreground panel's own edges don't
      abruptly cut off against page content — consider whether the panel
      needs to fully cover the viewport height, a soft shadow at the edge,
      or similar, rather than a hard torn-edge cutoff with nothing behind.
- [ ] **VODs page: Twitch login button** — the markup/flow looks correct on
      read-through and wasn't touched by the redesign, but the actual OAuth
      popup round-trip (real Twitch login → chat send) hasn't been
      exercised end-to-end this session (needs a real Twitch account to
      click through, not just code review).
- [ ] **`js/ga-config.js`'s `GA_MEASUREMENT_ID` is still the placeholder
      `"G-XXXXXXXXXX"`.** Kevin needs to create a GA4 property
      (analytics.google.com → Admin → Create Property → Web data stream
      for zevkev.de) and paste the real Measurement ID in — this is not a
      secret, a plain GitHub web-UI edit is fine, no repo secret needed.
      Until then `js/consent.js` deliberately never loads the real gtag.js
      script even if a visitor accepts the cookie banner (checked via
      `isConfigured`), so analytics silently stays off in production —
      don't be alarmed that GA shows zero data, check this file first.
- [ ] GitHub Pages "Enforce HTTPS" — was pending automatic cert issuance,
      never confirmed enabled since.

## Testing caveat (not a site bug)

This project's dev-preview browser session has, in practice, shown several
environment quirks worth knowing about before assuming something is broken:
1. Its JS module cache can be extremely sticky (survives reload, hard
   refresh, even a dev-server restart) — confirmed once even a *full*
   preview-server stop/restart plus a brand new preview session still
   rendered a stale module (a nav-label rename kept showing the old
   label in every fresh tab tried). `fetch(url, {cache:'no-store'})`
   and `import(url + '?bust=' + Date.now())` *usually* work but aren't
   guaranteed — when they don't, fall back to `curl`/a plain `fetch()`
   of the raw file from Bash instead of fighting the browser tool
   further; it's never been wrong. Don't conclude a fix didn't land
   just because the rendered page still shows the old text — check the
   served bytes directly first.
   **Deeper variant found 2026-09-18**: a page's *already-executing*
   top-level module side effects (e.g. a `window.addEventListener(...)`
   registered once at module load) can keep running old logic even when
   `fetch(url, {cache:'no-store'})` confirms the served bytes are already
   correct, and even across a full preview-server restart + brand new
   tab — the stale *instance* that already ran its top-level code doesn't
   get replaced just because a later fetch/tab proves the file itself is
   fixed. Confirmed via a real bug hunt (account.js's post-signup avatar
   refresh silently using pre-edit logic for several restart+new-tab
   cycles). The one thing that actually forced fresh top-level code to
   run: `await import('/js/<file>.js?cb=' + Date.now())` — dynamically
   re-importing the SPECIFIC page-controller module with a cache-busting
   query from within the live page (via `javascript_tool`), which
   re-executes its top-level side effects (new listeners etc.) in that
   already-open tab. If a fix touches a file's top-level/module-load-time
   code (not just a function body called fresh each time), and a normal
   reload/new-tab/server-restart still shows old behavior despite correct
   served bytes, try this before concluding the fix is broken.
2. Screenshot pixel coordinates and `getBoundingClientRect()`/CSS-pixel
   coordinates were observed to NOT match 1:1 in at least one session
   (`window.innerWidth` reported 961 while screenshots rendered at 800px
   wide). If a scripted click via computer-tool coordinates seems to hit
   the wrong element, don't assume the site's event handling is broken —
   re-derive the click position from an actual screenshot's own pixels,
   not from `getBoundingClientRect()`, before concluding there's a real bug.
   This exact mismatch produced a completely convincing but entirely fake
   "clicking a size swatch closes the quick-view" bug report this session:
   `elementFromPoint()` and a debug click-listener both agreed the wrong
   element (the modal backdrop) was receiving the click, every time, at
   coordinates computed via `getBoundingClientRect()` — right up until the
   same click, aimed using a screenshot's own pixel position instead,
   worked perfectly. Trust the screenshot's pixels for click coordinates.
3. **A screenshot taken immediately after navigating to a fresh page can
   show content at very low opacity/contrast** (text barely visible,
   paper-card backgrounds missing) for roughly 2-5 seconds — fonts/images
   still decoding, not a real rendering bug. Wait a couple seconds and
   re-screenshot before concluding a page is broken or a theme's colors
   are missing. Also: this dev-preview browser tool occasionally reuses a
   stale tab whose title/URL doesn't match what it actually shows (seen
   after several `navigate()` calls in a row) — if a screenshot looks like
   it's showing two pages' content overlapping or a URL that doesn't match
   the visible content, close the tab and open a fresh one rather than
   trying to debug it as a site bug. This got worse when background agents
   were also active: the browser pane's tabs are a genuinely SHARED pool —
   an agent's own local file preview or dev-server tab can silently become
   the "fronted" tab a plain `navigate()`/`screenshot()` call lands on if
   you omit an explicit `tabId`. Always pass an explicit `tabId` for every
   call once more than one thing might be using the browser, and use
   `tabs_context` to confirm which tab is actually yours before trusting
   a screenshot.
4. The dev-preview server (plain `python -m http.server`, no cache-control
   headers) lets the browser cache CSS files aggressively across
   navigations in the same tab — editing a `.css` file and reloading the
   page can still show the OLD stylesheet. This produced a confusing false
   trail this session (a CSS fix that measured as applied via `fetch(url,
   {cache:'no-store'})` still showed the old computed style after a normal
   navigate). Before concluding a CSS change "isn't working," cache-bust
   the stylesheet links: `document.querySelectorAll('link[rel=stylesheet]')
   .forEach(l => l.href = l.href.split('?')[0] + '?bust=' + Date.now())`
   — or, more robustly (survives the link staying the *same element*),
   remove each old `<link>` and append a brand new one pointing at a
   `?bust=<timestamp>` URL, awaiting its `onload` before checking anything.
5. **`preview_start`'s `name`-based launcher does NOT run a launch.json
   entry's `runtimeArgs` verbatim for a Python static-server config** —
   confirmed 2026-09-17 by checking the actual OS process list
   (`Get-CimInstance Win32_Process`): regardless of what `runtimeArgs` said
   (tried pointing it at a custom script), the real command line was always
   `python -m http.server <port> --directory <project root>`. Don't try to
   customize the local dev server's behavior (custom headers, a different
   handler, etc.) through this tool's `launch.json` — it silently ignores
   that and there's no server-side workaround available here. Also: the
   `cwd` field `preview_list` reports for one of these server processes is
   NOT its actual document root (it showed an unrelated empty sibling
   folder containing only a `.claude/` dir) — it's session-tool metadata,
   not meaningful for diagnosing what's actually being served. Trust the
   real process's `--directory` arg (or just curl the port) instead.
6. **The HTML document itself gets HTTP-cached too, not just CSS/JS**
   (2026-09-22) — caveat #4 above only covers stylesheets, but a plain
   `navigate()` to the same path, even closing the tab and opening a brand
   new one, can keep rendering a stale *page* (confirmed via `Last-
   Modified` on a `fetch()` of the HTML being several days old, with
   `transferSize: 0` — served straight from disk cache, no network hit at
   all). Query strings on `<script src>`/`<link href>` don't help this
   layer. What actually works: `navigate()` to the path with a genuinely
   unique query string on the DOCUMENT url itself, e.g.
   `/index.html?v=<timestamp>` — confirmed this forces a real fresh fetch
   where `?bust=1` (a repeated, non-unique value across calls) did not.
7. **`mountLayout()` (`js/layout.js`) only ever mounts once per real page
   load — calling it again against an already-mounted page silently no-
   ops** (2026-09-22). It finds its targets via
   `document.getElementById("site-header"/"site-footer")`, and its own
   `outerHTML =` swap on first run replaces those placeholder divs with
   `<header class="site-header">`/`<footer class="site-footer">` elements
   that carry the *class* but not the *id* — so a second call's
   `getElementById` returns `null` and the `if (slot) ...` guard quietly
   skips the update. This isn't a bug (a genuine fresh page load only ever
   mounts once, by design), but it means the usual "dynamically re-import
   with `?cb=`" trick (caveat #1) doesn't work for verifying a
   `js/layout.js` change against an already-open tab — you'll re-import
   fresh code but `mountLayout()` will do nothing visible. Use a real
   fresh navigation (see #6 above) instead, or manually extract/render the
   relevant template string for a quick visual check.

## Do not

- Don't re-litigate the cork texture recipe without reading the comment
  above `.rip--photo::before` / `.product-photo-frame` in style.css/shop.css
  first — it already went through three failed directions this session.
- Don't build a second custom analytics backend — Google Analytics 4 is
  the current, explicit decision (reversed from an earlier custom-
  dashboard choice; see "Already done"). Don't flip this again without
  being asked.
- Don't ever enter a password, API key, or other credential into a login
  form or GitHub Secret on Kevin's behalf, even if he pastes the value
  directly and asks — this is a hard rule regardless of consent. Point
  him to the exact steps instead; this actually happened with
  `YOUTUBE_API_KEY` on 2026-09-18 — the assistant filled in only the
  *name* field on GitHub's "New secret" form and left the value field for
  Kevin to paste into himself.
- Don't fabricate or guess at a Widerrufsbelehrung (right-of-withdrawal
  legal notice) — still missing, needs a Steuerberater/Anwalt, not an AI.
