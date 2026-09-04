# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Single owner, on trusted personal devices. Opens the page dozens of times a day as the default new-tab page: half-second glances (time, day shape, search, jump) plus intentional focus sessions (pomodoro timer, current task). No multi-user, guest, or shared-household case.

## Product Purpose

A personal threshold, not a destination. It gets out of the way so the owner can see the shape of the day, start something, or leave — in under a second. Success is: opens instantly on every new tab, stays quiet enough to ignore, and keeps tasks / notes / favorites identical across devices.

## Positioning

Timer-first start page. The pomodoro timer with its long-break cycle is the centrepiece; search, jump favorites, and one-at-a-time panels (tasks, notes, listen) orbit it. Deliberately the opposite of an information-dense dashboard: no feeds, no widgets competing for attention.

## Operating Context

- Default new-tab page at `homepage.malmqvist.dev`, desktop and mobile web.
- Search box focused on load for type-and-go: bangs, web search, local commands (`t` task, `n` note, `timer 25`, `2+2` calculator).
- Focus session ending ticks off the current task and advances the queue; day rollover at local midnight.
- Audio stations (Spotify / YouTube) are per-tab by browser design: one tab kept open for music, the rest are plain start pages. Embeds are created only on station click.
- Static frontend in `public/`, serverless functions in `api/`, Vercel Postgres state, signed-cookie single-password auth. `vercel dev` locally; no build step.

## Capabilities and Constraints

- Synced (one JSONB row, last-write-wins on `updatedAt`): durations + pomodoro count + sessions (7-day retention), tasks / later / currentTaskId / day rollover, notes, intention line, favorites (max 8), stations, search engine, weather coordinates + label, background mode, wallpaper config, favicon toggle, sounds. Sync whitelist is derived from `DEFAULTS` in `public/js/store.js`; adding a field there is the whole change.
- Deliberately not synced: the running timer (per-device).
- Offline-tolerant: snapshot to local browser storage on every change, debounced push, pull on load / focus / 60s, never clobber a pending local write; failed writes retry with backoff.
- Load budget (standing regression line): nothing fetched on load except what renders the page. Self-hosted font, CSS-only background, no blocking third-party. Weather (`open-meteo.com`, saved coordinates only) and favicons (`duckduckgo.com`, off by default) are the only optional third-party calls.
- Auth: single `APP_PASSWORD`, signed-cookie session via `APP_SECRET`. Login throttled per IP (8 failures / 15 min) and fails open on DB outage so the owner is never locked out. `/api/health` is intentionally unauthenticated and returns booleans only — never Node version, raw DB errors, or password length.
- Undecided: nothing open; scope changes need explicit ask.

## Brand Commitments

Name: Homepage at `homepage.malmqvist.dev`. Voice: plain, quiet, no marketing copy. No logo, testimonials, or claims to preserve — future work must not invent any.

## Evidence on Hand

- `README.md`: deploy, security model, state shape, sync rules.
- `public/index.html` + `public/js/store.js` (`DEFAULTS`): incumbent feature set and sync contract.
- `schema.sql` (reference copy; real table auto-created on first login), `api/state.js`, `api/_lib/ratelimit.js`.
- Absences future work must not fabricate: no analytics, no user accounts, no testimonials, no pricing.

## Product Principles

1. Threshold, not destination: every glance resolves in under a second or the design failed.
2. Quiet by default: only the current job (timer, search, one panel) may ask for attention.
3. Instant over rich: never trade load time for a widget, font, or icon.
4. Sync without surprise: cross-device state converges, local edits are never lost to a pull.
