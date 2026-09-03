# homepage.malmqvist.dev

Personal browser start page with cross-device sync, used as the default new-tab page.
Static frontend in `public/`, Node serverless functions in `api/`, Vercel Postgres for
state, signed-cookie auth. See `README.md` for the deploy walkthrough.

## Commands

```bash
npm install
vercel env pull      # pulls DB connection + env vars into .env.local
vercel dev           # run frontend + api functions locally
```

There is no build step and no `scripts` block — Vercel serves `public/` statically and
treats each file in `api/` as a function. The frontend uses native ES modules
(`<script type="module">`), which is why it can be split across files without a bundler.
Don't add one.

## Layout

| Path | What |
|---|---|
| `public/index.html` | Page structure and the settings dialog |
| `public/styles.css` | Design tokens, the four time-of-day grounds, all layout |
| `public/js/store.js` | Synced state, `DEFAULTS`, the last-write-wins sync loop |
| `public/js/main.js` | Boot, login gate, mounts every panel once |
| `public/js/ribbon.js` | The day ribbon — the page's hero element |
| `public/js/pomodoro.js` | Timer, sounds, and the Focus panel |
| `public/js/*.js` | One module per panel: tasks, notes, favorites, stations, weather, search, theme, settings |
| `public/fonts/` | Self-hosted IBM Plex woff2 |
| `api/login.js`, `logout.js` | Password auth, issues/clears the signed session cookie |
| `api/state.js` | Read/write the synced state blob |
| `api/health.js` | Liveness + config check |
| `api/_lib/` | Shared helpers (db access, cookie signing) |
| `schema.sql` | Reference schema — created automatically on first login |

## Notes

- **Two env vars are required:** `APP_PASSWORD` (login) and `APP_SECRET` (cookie
  signing). Missing `APP_SECRET` silently breaks sessions rather than erroring loudly.
- Single-user by design. Don't add multi-tenancy, user tables, or per-user scoping
  unless asked — the auth model assumes exactly one password holder.
- **Login throttling** (`api/_lib/ratelimit.js`) is the only thing that couples login to
  the database, and it fails open on purpose — a database outage must not lock the owner
  out. Keep it that way. The decision logic is `nextAttemptState()`, kept pure so it can
  be tested without a database.
- **`/api/health` is intentionally reachable without a session**, because it exists to
  diagnose a deployment you can't log into. Anything that would help an attacker — the
  Node version, raw database errors — goes behind the cookie check; the password's length
  is never returned. Don't widen the anonymous response.
- **Adding a synced field:** add it to `DEFAULTS` in `public/js/store.js` and you're
  done. The sync whitelist is derived from `DEFAULTS`, and `api/state.js` stores the
  blob without inspecting it, so no server change is needed.
- Mutate `state` in place and call `commit()` (save + re-render) or `save()` (persist
  only, for fields being actively typed into). Never reassign `state` — every module
  holds the same reference.

## Design constraints

This page opens on every new tab, so two rules govern changes:

- **Nothing fetches on load that isn't needed to read the page.** Fonts are self-hosted;
  embeds don't exist in the DOM until a station is clicked; favicons are off by default.
  Adding a blocking third-party request is a regression.
- **One bold element, one signal colour.** The day ribbon is the hero; `--signal`
  (amber) marks only *now* and a running timer. Everything else lives in greys derived
  from `--fg-rgb`. Zones are separated by hairline rules and whitespace — no cards, no
  fills, no drop shadows.

Adding a time-of-day ground means adding three values (`--ground`, `--fg`, `--fg-rgb`)
to a `[data-phase]` block; every other tone derives from them.
