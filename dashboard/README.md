# ZevKev Privat -- setup checklist

One-time setup for the private analytics dashboard at `privat.zevkev.de`.
This is a separate Cloudflare Pages project from the main site (which stays
on GitHub Pages) -- it exists specifically so visitor analytics never go
through Google Analytics or any other third party.

Written assuming you've never used Cloudflare before. Do these steps in
order.

## What's already built

- `schema.sql` -- the D1 (Cloudflare's SQLite) database schema.
- `wrangler.toml` -- the Cloudflare Pages project config.
- `functions/api/track.js` -- records anonymous visitor events (called by
  the main site's `js/track.js`, being wired up separately).
- `functions/api/login.js` / `logout.js` -- your own password login for
  the dashboard.
- `functions/api/stats.js` -- the aggregated stats the dashboard reads.
- `public/` -- the dashboard's own frontend (password form + charts).

None of this is deployed yet. That's what this checklist does.

## 1. Create a Cloudflare account and install Wrangler

1. If you don't already have one, create a free account at
   https://dash.cloudflare.com/sign-up. The free tier covers this project
   comfortably (D1 and Pages both have generous free limits for a single
   low-traffic site).
2. Install Wrangler, Cloudflare's command-line tool, globally:
   ```
   npm install -g wrangler
   ```
   (Needs Node.js installed -- if `npm` isn't recognized, install Node
   from https://nodejs.org first.)
3. Log in:
   ```
   wrangler login
   ```
   This opens a browser tab to authorize Wrangler against your Cloudflare
   account.

## 2. Create the D1 database

From anywhere (this doesn't need to be run from a specific directory):

```
wrangler d1 create zevkev-privat-db
```

This prints a `database_id` (a UUID). Copy it, then open
`dashboard/wrangler.toml` and replace the placeholder:

```toml
database_id = "REPLACE_WITH_DATABASE_ID_FROM_WRANGLER_D1_CREATE"
```

with the real id. Commit that change (this id isn't a secret -- it's just
an identifier, safe to commit).

## 3. Apply the schema

From the repo root:

```
wrangler d1 execute zevkev-privat-db --remote --file=./dashboard/schema.sql
```

This creates the `events` table and its indexes in the real (remote) D1
database. (Drop `--remote` if you ever want to try things against a local
throwaway database instead -- not needed for the real setup.)

## 4. Set the two secrets

These are never written to any file in the repo -- they're stored
directly by Cloudflare and only exposed to your Pages Functions at
runtime as `env.DASHBOARD_PASSWORD` / `env.SESSION_SECRET`.

```
wrangler pages secret put DASHBOARD_PASSWORD --project-name=zevkev-privat
```
This prompts you to type a value -- pick a real password, this is what
gates the whole dashboard.

```
wrangler pages secret put SESSION_SECRET --project-name=zevkev-privat
```
This can be any long random string -- it's only used internally to sign
your login session, you never type it yourself day-to-day. Generate one
with:
```
openssl rand -hex 32
```
(If you don't have `openssl` handy, any long random string works -- the
main thing is that it's long and nobody else knows it.)

Note: the very first `wrangler pages secret put` for a project that
doesn't exist yet in Cloudflare's dashboard may prompt you to create the
project, or may need the project to exist first via an initial deploy.
If it complains the project doesn't exist, run step 5 once first (it will
create the project on first deploy), then come back and set the secrets,
then redeploy.

## 5. Deploy

Pages Functions (everything in `functions/`) are auto-detected by
Wrangler relative to the **current working directory**, not relative to
the output folder you pass it. Since this project's `functions/`
directory lives at `dashboard/functions/` (a sibling of `dashboard/public/`,
not nested inside it), you have to run the deploy command from *inside*
`dashboard/`, not from the repo root:

```
cd dashboard
wrangler pages deploy public --project-name=zevkev-privat
```

Running `wrangler pages deploy dashboard/public --project-name=zevkev-privat`
from the repo root instead would upload the static frontend fine but
silently skip the `functions/` directory, since Wrangler would be looking
for `functions/` at the repo root, not inside `dashboard/`. If the
dashboard loads but every `/api/*` request 404s, this is the first thing
to check.

The first deploy prints a `*.pages.dev` URL -- open it and confirm the
password form loads before moving on to the custom domain.

## 6. Add the custom domain

1. In the Cloudflare dashboard: **Workers & Pages** -> your `zevkev-privat`
   project -> **Custom domains** tab -> **Set up a custom domain**.
2. Enter `privat.zevkev.de` and follow the prompts. Cloudflare will show
   you a CNAME record to add.
3. At Namecheap (where `zevkev.de`'s DNS is managed), add that CNAME
   record for the `privat` subdomain. No nameserver migration to
   Cloudflare is needed -- a plain CNAME at Namecheap is enough for
   Cloudflare Pages custom domains to work (already confirmed in an
   earlier planning session).
4. DNS propagation + Cloudflare's automatic TLS certificate can take a few
   minutes up to a couple of hours. `privat.zevkev.de` should then load
   the same dashboard as the `*.pages.dev` URL.

## 7. Connect the main site's tracking

A separate effort is wiring `js/track.js` into the main zevkev.de site
(layout, catalog, cart, video players) so it actually `POST`s events to
`https://privat.zevkev.de/api/track`. That work happens outside this
`dashboard/` directory and isn't part of this checklist -- once both
sides are deployed, opening the dashboard (steps above) and refreshing
after visiting the main site should start showing real numbers.

If the dashboard loads but stays empty even after visiting the main site,
check the browser console on zevkev.de for CORS errors first --
`functions/api/track.js` only allows requests from `https://zevkev.de`
and `localhost` origins by design (see the comment in
`functions/_lib/cors.js`).

## Day-to-day use

Just open `https://privat.zevkev.de`, enter the password you set in step
4, and use the range selector (24 Stunden / 7 Tage / 30 Tage / Gesamt) to
switch time windows. Sessions last 7 days before you need to log in
again. The "Abmelden" (logout) button ends the session immediately.

## If you ever need to change the password or session secret

Re-run the relevant `wrangler pages secret put` command from step 4 with
a new value, then redeploy (step 5) so the new secret takes effect.
Changing `SESSION_SECRET` immediately invalidates any existing login
session (yours included) -- you'll need to log in again afterward.
