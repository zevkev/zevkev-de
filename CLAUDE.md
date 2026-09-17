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
| `js/currency.js` | Loads `/assets/data/exchange-rate.json` once per page, exports `money()`/`toEUR()` to convert Fourthwall's USD prices to EUR for display. Falls back to showing USD if the rate file is missing/unreachable |
| `js/vods.js` + `js/twitch-auth.js` | VODs page: live > Twitch VOD > YouTube fallback player, Twitch OAuth popup login + chat |
| `js/youtube.js` | YouTube page: Videos/Shorts grid, custom modal player |
| `scripts/fetch-main-feed.mjs` | Fetches full YouTube upload history via Data API v3 (needs `YOUTUBE_API_KEY` secret — not yet set) |
| `scripts/fetch-twitch-status.mjs`, `fetch-vod-feed.mjs` | Twitch live status + VOD archive fetch |
| `scripts/fetch-exchange-rate.mjs` | Fetches USD->EUR from Frankfurter (free, keyless) into `assets/data/exchange-rate.json` for `js/currency.js` |
| `.github/workflows/data-refresh.yml` | Cron (every 5 min): runs the fetch scripts, commits data back via `github-actions[bot]` |
| `dashboard/` | **In progress, incomplete.** Cloudflare Pages analytics dashboard for privat.zevkev.de — only `schema.sql` + `wrangler.toml` exist so far |

## Conventions

- Dark mode: define light values in bare `:root`, dark overrides in
  `:root[data-theme="dark"]`. Toggle sets `data-theme` on `<html>`.
- **Buttons don't inherit text `color` from ancestors** (browser default) —
  always set `color` explicitly on custom buttons, or they render black
  regardless of theme. This exact bug hit `.cart-close` once already.
- Modals reuse `.cart-backdrop` / `.qv-panel` / `.qv-close` chrome
  (`js/youtube.js` and `js/vods.js`'s custom video-player modals use this
  pattern; the shop's own quick-view modal that originated it is gone now —
  replaced by `js/product.js`'s real page, which still reuses the same
  `.qv-*` class names for its lightbox/gallery/option pieces even though
  it's no longer a modal). Keep new modals consistent with this rather than
  inventing a new pattern.
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
  in light mode), not a functional fix — clarify which before touching it.
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
- [ ] **New dedicated Watchlist page**, separate from both `/vods/` and
      `/youtube/`. Both pages already save starred items to the same
      localStorage key (`WATCHLIST_KEY` in `js/vods.js` / `js/youtube.js` —
      confirm it's literally the same key before building a page that reads
      both). Requested so a visitor with saved items has one place to see
      them all, instead of the star only ever filtering within whichever
      page it was clicked on.
- [ ] **Quick-view/product page bottom edge — needs a decision, not just a
      fix.** With the backdrop now fully transparent (see "Already done"),
      the user flagged that where the panel's own paper background/torn
      edge ends, the ordinary page content behind it becomes visible right
      up against that edge, which read as visually broken ("Papier hört
      auf" / paper stops, looks see-through) rather than as an intentional
      "note on top of the page" look. Once product pages replace the modal
      (item above), this specific complaint may become moot — but if any
      modal/overlay pattern remains anywhere (e.g. the video player
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
- [ ] **Analytics dashboard** (`dashboard/`) — barely started. Needs: D1
      schema finished, Pages Functions (`/api/track`, `/api/login`,
      `/api/stats`), password-gated frontend (Kevin's own visual style, not
      a generic admin-panel look — this reverses an earlier "YouTube
      Studio style" decision), the `js/track.js` client snippet wired into
      layout.js/catalog.js/cart.js. Needs a free Cloudflare account from
      Kevin first (not created yet) — ask before assuming it exists.
- [ ] **DNS**: `privat.zevkev.de` doesn't exist yet — one CNAME at
      Namecheap once the Cloudflare Pages project is created (confirmed:
      no nameserver migration needed, Cloudflare Pages custom domains work
      with a plain CNAME at an external registrar).
- [ ] GitHub Pages "Enforce HTTPS" — was pending automatic cert issuance,
      never confirmed enabled since.
- [ ] **Full YouTube video history** needs a `YOUTUBE_API_KEY` GitHub repo
      secret from Kevin (Google Cloud Console → enable YouTube Data API v3
      → create an API key — exact steps are in the header comment of
      `scripts/fetch-main-feed.mjs`). The script is already written and
      waiting for it; this is purely a "ask Kevin to do this one console
      step" item, not something to implement further.

## Testing caveat (not a site bug)

This project's dev-preview browser session has, in practice, shown two
environment quirks worth knowing about before assuming something is broken:
1. Its JS module cache can be extremely sticky (survives reload, hard
   refresh, even a dev-server restart). Cache-bust before trusting a JS
   behavior check: `fetch(url, {cache:'no-store'})` or
   `import(url + '?bust=' + Date.now())`.
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
3. The dev-preview server (plain `python -m http.server`, no cache-control
   headers) lets the browser cache CSS files aggressively across
   navigations in the same tab — editing a `.css` file and reloading the
   page can still show the OLD stylesheet. This produced a confusing false
   trail this session (a CSS fix that measured as applied via `fetch(url,
   {cache:'no-store'})` still showed the old computed style after a normal
   navigate). Before concluding a CSS change "isn't working," cache-bust
   the stylesheet links: `document.querySelectorAll('link[rel=stylesheet]')
   .forEach(l => l.href = l.href.split('?')[0] + '?bust=' + Date.now())`.

## Do not

- Don't re-litigate the cork texture recipe without reading the comment
  above `.rip--photo::before` / `.product-photo-frame` in style.css/shop.css
  first — it already went through three failed directions this session.
- Don't assume Google Analytics — the user explicitly chose a custom
  dashboard instead, specifically to avoid sending data to Google.
- Don't fabricate or guess at a Widerrufsbelehrung (right-of-withdrawal
  legal notice) — still missing, needs a Steuerberater/Anwalt, not an AI.
