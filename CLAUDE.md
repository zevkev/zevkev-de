# ZevKev Website (zevkev.de)

Read this first, then only the files a task touches.

## What this is

Static site for Kevin Kliver ("ZevKev"), German YouTuber and Twitch streamer
(`zevkev_`). Repo `github.com/zevkev/zevkev-de`, hosted on **GitHub Pages**
(custom domain zevkev.de). There is **no server and no backend**: plain
HTML + ES modules, Tailwind CSS v4 compiled in CI, data JSON refreshed by a
GitHub Actions cron, shop data and checkout from Fourthwall. Kevin explicitly
wants it to stay that way (no accounts, no Firebase, no hosted APIs).

Rewritten from hand-written CSS to Tailwind on 2026-10-30. The same day,
login/accounts, comments, watchlist, internal watch pages (/video/, /vod/),
/live/, /privat/, Firebase and the custom Twitch chat login were removed on
Kevin's request. The old work-in-progress for achievements/accounts is in
`git stash` (`stash@{0}`), not in the tree.

## Owner rules (non-negotiable)

- UI copy is German, casual. **No emojis anywhere** (SVG icons instead;
  `js/text.js` `cleanText()` strips emojis from video titles). **No em-dashes
  or dashes as punctuation** in copy.
- Identity: torn paper cards and washi tape on a blue cutting mat, cork photo
  mats, Bebas Neue headings, Flux-UI-style controls. Modern, but keep it.
- Dark mode uses cool slate tones, never brown (only exception: the cork mat
  behind shop photos, so white products stay visible).
- Video cards link straight to YouTube / Twitch **in the same tab** (no
  `target="_blank"`, no modals, no watch pages). Only the Twitch *live*
  player is embedded (Mehr page).
- "Flux": Kevin asked for Flux + Tailwind (free versions). Flux UI requires
  Laravel/PHP, so its look was recreated with Tailwind; there is no Flux code.

## Switches Kevin edits in the GitHub web UI

| File | Effect |
|---|---|
| `twitch.txt` | `twitch = true` / `twitch = false`: every Twitch element on the site, plus the Twitch fetch in `data-refresh.yml`. Off turns the "Mehr" page into "ZevKev+". |
| `aktion.txt` | Shop promo banner: `aktiv = ja/nein`, `text`, `code`, `bis = JJJJ-MM-TT`. |
| `js/ga-config.js` | GA4 Measurement ID (still the placeholder, so analytics stays off). |

## Architecture map

| Path | What it is |
|---|---|
| `src/app.css` | Design system: tokens (light `:root`, dark `[data-theme="dark"]`), Tailwind theme, `dark:` variant, fonts, components (`.paper`, `.tape`, `.cork`, `.polaroid`, `.btn*`, `.icon-btn`, `.badge*`, `.label-chip`, `.seg`, `.video-card`, `.reveal`, `.toast`, header/footer chrome). Imports `src/pages/*.css` at the end. |
| `src/pages/{home,shop,vods,youtube,legal}.css` | Page styles, each inside `@layer components`. |
| `assets/css/app.css` | **Generated** (`npm run build`), gitignored, built in `deploy.yml`. |
| `assets/fonts/` | Self-hosted Bebas Neue + Jost (no Google Fonts requests). |
| `js/boot.js` | Classic script in `<head>`: applies saved theme and cached Twitch state before paint. |
| `js/layout.js` | Header, footer, mobile nav, theme toggle, cookie banner, cart button on `/shop*`. Mounts itself on import. Exports `ICONS`/`brandIcon`. |
| `js/twitch.js` | Reads `/twitch.txt`, sets `html.twitch-on/off`. Markup: `data-twitch` (on only), `data-no-twitch` (off only), `data-twitch-soft` (unless known off). |
| `js/theme.js`, `js/consent.js`, `js/ga-config.js`, `js/track.js`, `js/reveal.js`, `js/text.js` | Theme toggle; GA4 consent banner (GA never loads without consent); GA4 events; scroll reveal; emoji-free title cleaning. |
| `index.html` + `js/home.js` | Homepage: hero, Discord zone, hosts, Twitch zone (`data-twitch`). |
| `shop/`, `js/catalog.js`, `js/product.js`, `js/cart.js`, `js/fourthwall-api.js`, `js/currency.js` | Shop grid, product page, cart drawer, Fourthwall Storefront client. |
| `404.html` | GitHub Pages fallback: renders `/shop/<slug>` product pages, redirects old `/video/<id>/` to YouTube, `/vod/<id>/` to Twitch, `/live/` to `/vods/`, removed account pages to `/`, else a 404 card. Must stay at repo root. |
| `vods/` + `js/vods.js` | "Mehr" page: hero = live player > newest Twitch VOD > newest ZevKev+ video; Twitch archive grid; ZevKev+ YouTube grid. |
| `youtube/` + `js/youtube.js` | Main channel: hero, Videos/Shorts tabs (`#shorts`), sort, load more. |
| `impressum/ datenschutz/ agb/ widerruf/ kontakt/` | Legal + contact pages (`.legal` typography). |
| `scripts/*.mjs` + `.github/workflows/data-refresh.yml` | Every 30 min: YouTube main feed (Data API, `YOUTUBE_API_KEY` secret), ZevKev+ RSS feed, Twitch status + VODs (secrets `TWITCH_CLIENT_ID/SECRET`) into `assets/data/*.json`, committed by the bot. |
| `.github/workflows/deploy.yml` | On push to main: `npm ci`, `npm run build`, deploy to Pages. |
| `tools/cdp-shot.mjs` | Headless Chrome test tool (see Testing). |

## Fourthwall facts (verified live)

- Public storefront token in `js/config.js` (safe client-side).
- Request every price with `currency=EUR`; no client-side conversion.
- Fourthwall's edge blocks PUT/PATCH/DELETE (shows up as CORS errors): carts
  use `POST /carts`, `/carts/{id}/add`, `/change`, `/remove`.
- The API ignores `per_page` and pages 10 items by default: page with
  `size`/`page`.
- Variant `attributes` = `{description, color:{name,swatch}, size:{name}}`;
  each variant has its own `images` (identical across sizes of one color), so
  the product gallery shows only the selected color's images.
- Checkout: `https://shop.zevkev.me/checkout/?cartCurrency=EUR&cartId=...`
  (verified 200). `zevkev.me` itself redirects to zevkev.de and must not be
  used for checkout.

## Conventions

- New pages: copy the head of an existing page (fonts preload, `/assets/css/app.css`,
  `js/boot.js`), `<main id="main" class="page">`, `<div id="site-header">`,
  `<div id="site-footer">`, `<script type="module" src="/js/layout.js">`.
  **Add any new top-level folder to the `@source` list in `src/app.css`**, or
  its Tailwind classes won't be generated.
- `.paper`: the shadow is a `filter: drop-shadow` on the element, the torn
  shape a `clip-path` on `::before`, so the shadow follows the tear. Don't
  nest `.paper` inside `.paper` with the same color.
- Dark overrides of component classes use `:where([data-theme="dark"])` so
  variant classes (e.g. `.badge-live`) still win.
- `.reveal` is an animation, not a transition, so it never replaces hover
  transitions. Opacity snaps (never semi-transparent over the mat).
- Homepage background: painted by `body.home` only (colour wash + texture in
  one background). Sections stay transparent. This is what fixed the
  repeated "blue seam between Discord and Twitch" complaint; never give a
  section its own background again.
- Buttons don't inherit `color`; set it explicitly on custom buttons.

## Testing

- `npm install` once, then `npm run dev` (Tailwind watch) and the preview
  server `zevkev-site` (python http.server on 8100). That server does NOT
  serve `404.html`, so test product pages via `/shop/product/?slug=<slug>`.
- `node tools/cdp-shot.mjs --url http://localhost:8100/shop/ --out shot.png
  [--mobile --width 390 --height 844] [--scheme dark] [--full] [--eval "js"]
  [--storage '{"zevkev-consent":"declined"}']` prints console errors,
  exceptions and HTTP >= 400. Headless Chrome can't go below ~500px wide,
  hence `--mobile`.
- The in-app browser pane caches modules, CSS and even HTML aggressively;
  if something looks stale, check the served bytes before assuming a bug.

## Open items

- [ ] GA4 Measurement ID placeholder in `js/ga-config.js`.
- [ ] GitHub Pages "Enforce HTTPS": never confirmed enabled.
- [ ] Widerrufsbelehrung needs a professional (don't write legal text).
- [ ] Shop filters are hidden while the only collection equals "Alle"; they
      appear automatically once another collection exists.
- [ ] Firebase project and the MSPR downloader on Render.com are no longer
      used by the site; Kevin can delete them.

## Do not

- Never type passwords, API keys or secret values into any form or GitHub
  secret for Kevin; point him to the steps instead.
- Don't invent legal text.
- Don't redesign the cork grain recipe (`.cork` in `src/app.css`), it was
  calibrated with Kevin against a reference photo.
- Don't add a backend, accounts or a second analytics system without being asked.
