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
| `js/catalog.js` | Shop grid — clicking a product navigates to `js/product.js` now, no more modal |
| `js/product.js` | Shop product detail page (`shop/product/?slug=...`), full page not a modal |
| `js/vods.js` + `js/twitch-auth.js` | VODs page: live > Twitch VOD > YouTube fallback player, Twitch OAuth popup login + chat |
| `js/youtube.js` | YouTube page: Videos/Shorts grid, custom modal player |
| `js/watchlist.js` | Dedicated Watchlist page — reads the shared `zevkev-watchlist` key, resolves ids against both `videos.json` and `main-videos.json` |
| `scripts/fetch-main-feed.mjs` | Fetches full YouTube upload history via Data API v3 (needs `YOUTUBE_API_KEY` secret — not yet set) |
| `scripts/fetch-twitch-status.mjs`, `fetch-vod-feed.mjs` | Twitch live status + VOD archive fetch |
| `.github/workflows/data-refresh.yml` | Cron (every 5 min): runs the fetch scripts, commits data back via `github-actions[bot]` |
| `dashboard/` | **In progress, incomplete.** Cloudflare Pages analytics dashboard for privat.zevkev.de — only `schema.sql` + `wrangler.toml` exist so far |

## Conventions

- Dark mode: define light values in bare `:root`, dark overrides in
  `:root[data-theme="dark"]`. Toggle sets `data-theme` on `<html>`.
- **Buttons don't inherit text `color` from ancestors** (browser default) —
  always set `color` explicitly on custom buttons, or they render black
  regardless of theme. This exact bug hit `.cart-close` once already.
- Modals reuse `.cart-backdrop` / `.qv-panel` / `.qv-close` chrome
  (`js/catalog.js`'s quick-view is the original; `js/youtube.js` and
  `js/vods.js`'s custom video-player modals copy the same pattern). Keep
  new modals consistent with this rather than inventing a new pattern.
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
- **Shop: product page instead of quick-view modal — done.** `js/catalog.js`
  no longer has `openQuickView()` (deleted, confirmed nothing else
  referenced it); clicking a product now navigates to
  `shop/product/?slug=<slug>`, rendered by the new `js/product.js` using
  the `.product-page` CSS that was already scaffolded for this. Verified
  in-browser: gallery + color-filtered thumbnails + lightbox zoom, variant
  selection, add-to-cart (opens the cart drawer, matching what "closing
  the modal" used to do), sold-out state, missing/unknown slug shows a
  friendly "Produkt nicht gefunden" message instead of a blank page,
  desktop/mobile, light/dark.
- **Watchlist page — done.** New `/watchlist/` page (`js/watchlist.js`,
  `css/watchlist.css`, `watchlist/index.html`), added to both the header
  nav (`js/layout.js` `NAV`) and footer links. Reads the shared
  `zevkev-watchlist` key and resolves ids against both `videos.json` and
  `main-videos.json`, tagging each card with a source badge. Verified
  in-browser with a real saved id.

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

## Currency conversion (was deferred, now in progress as of 2026-09-17)

- **Shop prices show USD, should show EUR.** Root cause fully diagnosed:
  Fourthwall's base currency is permanently fixed to USD for every shop
  (confirmed via their own help docs — not something any settings toggle
  changes). Their "Local currencies" feature (already enabled for EUR in
  Settings → Checkout) only converts within Fourthwall's own hosted
  checkout page, never reaches the Storefront API data this site's
  `js/cart.js`/`js/catalog.js`/`js/product.js` read directly, which always
  returns USD. Originally parked at the user's request to focus on shop/
  VODs/YouTube first — they've since explicitly asked for it, so it's back
  in scope. Approach: a `scripts/fetch-exchange-rate.mjs` cron script
  (same GitHub Actions pattern as the video-feed fetchers) caching a
  USD→EUR rate into `/assets/data/exchange-rate.json`, read by a new
  `js/currency.js` module, applied everywhere a price displays. Whether
  the actual Fourthwall checkout URL's `cartCurrency` param can also be
  switched to EUR (vs. leaving it USD and relying on Fourthwall's own
  checkout to auto-localize) needed live verification — check this file's
  "Already done" section above (once updated) or the commit history for
  what was actually found and shipped, rather than assuming either way.

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
4. **A screenshot taken immediately after navigating to a fresh page can
   show content at very low opacity/contrast** (text barely visible,
   paper-card backgrounds missing) for roughly 2-5 seconds — fonts/images
   still decoding, not a real rendering bug. Wait a couple seconds and
   re-screenshot before concluding a page is broken or a theme's colors
   are missing. Also: this dev-preview browser tool occasionally reuses a
   stale tab whose title/URL doesn't match what it actually shows (seen
   after several `navigate()` calls in a row) — if a screenshot looks like
   it's showing two pages' content overlapping or a URL that doesn't match
   the visible content, close the tab and open a fresh one rather than
   trying to debug it as a site bug.
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
