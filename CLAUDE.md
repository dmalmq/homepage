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

Run Grok **inside WSL**, not Windows PowerShell:

```bash
wsl
cd /mnt/c/Repositories/homepage
grok
```

Windows PowerShell opens a new console for every agent command, and `npm.cmd` / Chrome add more. WSL keeps the whole session in one terminal. If a session is still on Windows `pwsh`, wrap commands in `wsl -e bash -lc '...'` and never launch a visible Chrome for verification — use `chrome-headless-shell` or skip the browser.

There is no build step — Vercel serves `public/` statically and treats each file in
`api/` as a function. `npm test` uses Node's built-in runner and `npm run check`
syntax-checks the modules. The frontend uses native ES modules
(`<script type="module">`), which is why it can be split across files without a bundler.
Don't add one.

## Notes

- **Two env vars are required:** `APP_PASSWORD` (login) and `APP_SECRET` (cookie
  signing). Missing `APP_SECRET` rejects cookies and makes login fail closed.
- Single-user by design. Don't add multi-tenancy, user tables, or per-user scoping
  unless asked — the auth model assumes exactly one password holder.
- **Login throttling** (`api/_lib/ratelimit.js`) is the only thing that couples login to
  the database, and it fails open on purpose — a database outage must not lock the owner
  out. Keep it that way. Attempt reservation is a single atomic UPSERT so concurrent
  guesses cannot overwrite one another's counters.
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
- `schema.sql` is a reference copy — the real schema is created automatically on
  first login.

## Design constraints

This page opens on every new tab, so two rules govern changes:

- **Nothing fetches on load that isn't needed to read the page.** The gradient is
  CSS, the font is local, embeds don't exist in the DOM until a station is clicked,
  favicons are off by default. Adding a blocking third-party request is a regression.
- **The colour field is the only indulgence.** The timer stands in it; everything
  else is white type and translucent glass, deliberately quiet so nothing competes
  with the readout. Content that isn't the timer, search or favorites lives behind
  the dock, one panel at a time.

The mesh tracks the real hour. Adding a phase means adding a `--ground` and four
`--blob-*` colours to a `[data-phase]` block; the mesh geometry is shared, so
nothing else changes.

White type over saturated colour is the standing legibility risk. `.scrim` exists
solely to hold that contrast — if you brighten the blobs, check the scrim still
carries the corners, where the docks sit.

## History

An earlier version of this page was a quiet, grey, information-dense start page
built around a "day ribbon". It was deliberately replaced with the current
colour-field design, which reverses its "one signal colour, no fills, no shadows"
rules. Don't reintroduce those constraints by halves.
