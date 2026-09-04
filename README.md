# Homepage

A personal browser start page with cross-device sync, built to sit at
`homepage.malmqvist.dev` and be set as the default new-tab page.

The page is a threshold rather than a destination: it gets looked at dozens of times a
day for half a second at a time, so it stays quiet, loads instantly, and puts the shape
of your day above everything else.

## What's on it

- **The timer** — the centrepiece. Configurable durations, a dot per pomodoro in the
  current long-break cycle, and six end sounds.
- **Search** — focused on load, so you can open a tab and just start typing.
  Suggestions rank bangs, web search, and local commands (`t` task, `n` note,
  `timer 25`, `2+2`) as you type.
- **Jump** — up to eight favourite sites, one click away.
- **Tasks, Notes, Listen** — behind the dock at bottom-left, one panel at a time.
  Finishing a focus session ticks off the current task and moves to the next.
- **Weather and the time** — in the corners, out of the way.

The background is a CSS gradient mesh that shifts with the hour: dawn, day, dusk,
night. You can pin it to one phase in settings.

Everything except the running timer syncs across devices. Changes are also cached
immediately in this browser, so closing a tab before the network write finishes does
not discard them. The cache is plain local browser storage; use a trusted browser
profile for notes or tasks you consider sensitive.

## Two things worth knowing

**Audio doesn't survive across tabs.** Every new tab is a fresh page, so a station
started in one tab stops existing when that tab closes. Keep one tab open for music and
let the rest be start pages. Nothing loads an embed until you click a station, so the
common case stays instant.

**Two third-party requests, both optional.** Weather calls `open-meteo.com` with your
saved coordinates (no API key, no account). Favicons — off by default, letter tiles
instead — would fetch an icon per site from `duckduckgo.com` on every load. Fonts are
self-hosted, so there's no request to Google.

## Deploy

```bash
bash scripts/setup.sh
```

That walks through all of it: opens each page, tells you what to click, generates
`APP_SECRET` so it never gets typed, writes both secrets to Vercel and `.env.local`, and
finishes by checking `/api/health` to confirm what's actually live. Safe to re-run — it
remembers values already saved.

The same steps by hand:

1. Push to GitHub.
2. Vercel: **Add New → Project**, import the repo. It auto-detects `public/` as static
   hosting and each file in `api/` as a function. No build step.
3. **Storage → Create Database → Postgres**, connected to the project.
4. **Settings → Environment Variables**:

   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | your login password |
   | `APP_SECRET` | a long random string, used to sign the session cookie |

5. **Settings → Domains** → add `homepage.malmqvist.dev`. In Cloudflare, add a CNAME
   `homepage` → `cname.vercel-dns.com`, matching the proxy setting on the apex record.
   Cloudflare's SSL/TLS mode must be **Full (strict)** — Flexible causes a redirect loop.

The `state` table is created on first login, so `schema.sql` is reference rather than a
migration you have to run.

If login misbehaves, open `/api/health` first — it reports whether each env var is set
and whether the database is reachable, without revealing any values. A missing
`APP_SECRET` makes login return a configuration error and invalidates session cookies.

## Security

One password on a public URL is the whole attack surface, so:

- **Login is throttled per IP** — 8 failures in 15 minutes locks that address out for 15
  minutes, and every failure costs a fixed delay. This is the one place login touches the
  database, and it deliberately *fails open*: a database outage must not lock you out of
  your own page. An attacker with many addresses still gets 8 tries each, so the real
  protection is a long `APP_PASSWORD`.
- **The password comparison hashes both sides first**, so it can't leak the password's
  length through response timing.
- **`APP_SECRET` has no production fallback.** If it is absent, existing cookies are
  rejected and login fails closed rather than signing sessions with a known key.
- **`/api/health` is deliberately unauthenticated** — you need it to diagnose a deploy you
  can't log into. So it returns booleans only. The Node version and raw database errors
  require a valid session; the password's length is never returned at all.

## Local dev

```bash
npm install
vercel env pull        # downloads DB + env vars into .env.local
vercel dev
npm test               # Node's built-in test runner
npm run check          # syntax-check every frontend and API module
```

## State

One JSONB row holds everything:

```json
{
  "durations":  { "pomodoro": 25, "short": 5, "long": 15, "interval": 4 },
  "tasks":      [{ "id": "...", "text": "...", "done": false }],
  "currentTaskId": null,
  "notes": "",
  "completedPomodoros": 0,
  "sessions":   [{ "t": 1700000000000, "minutes": 25 }],
  "sound": "chime",
  "favorites":  [{ "id": "...", "label": "GitHub", "url": "https://github.com" }],
  "stations":   [{ "id": "...", "kind": "spotify", "label": "...", "url": "..." }],
  "search":     { "engine": "duckduckgo" },
  "weather":    { "lat": null, "lon": null, "label": "" },
  "ground":     { "mode": "auto" },
  "useFavicons": false,
  "updatedAt": 1700000000000
}
```

Last-write-wins on `updatedAt`. The client snapshots changes to local storage
immediately, pushes debounced writes, and pulls on load, focus, and every 60s. A pull
never replaces a pending local write; failed writes retry with backoff. `sessions` is
pruned to the last 7 days on load. The running timer is per-device and deliberately
not synced.

Adding a field means adding it to `DEFAULTS` in `public/js/store.js` — the sync
whitelist is derived from that object, so nothing else needs touching. `api/state.js`
stores the blob without inspecting it.
