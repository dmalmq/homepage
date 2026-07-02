# Pomodoro (self-hosted, cross-device sync)

A single-user Pomodoro page with a syncable backend. Deploy to Vercel, link a
Postgres database, set two env vars, and you can use it from any device with
the same tasks / notes / settings.

## Features

- Pomodoro / Short break / Long break timer with circular progress ring
- Configurable durations + long-break interval
- Tasks queue (add, reorder, edit, mark done, set current)
- Quick notes (auto-saved)
- 8 preset gradient backgrounds + custom image upload
- Fullscreen, soft WebAudio chime on completion
- Cross-device sync via Vercel Postgres + signed-cookie auth

## Deploy

1. Push this repo to GitHub.
2. In Vercel: **Add New > Project**, import the repo. Vercel auto-detects:
   - `public/` → static hosting
   - `api/` → Node serverless functions
3. **Storage > Create Database > Postgres (free)**. Connect it to the project.
4. **Settings > Environment Variables** — add:
   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | your login password |
   | `APP_SECRET` | a long random string (used to sign session cookies) |
5. Deploy. Open the URL, enter your password, done.

The schema is created automatically on first login; you don't need to run
`schema.sql` manually, but it's available if you want to set it up by hand.

## Local dev

```bash
npm install
vercel env pull        # downloads DB + your env vars into .env.local
vercel dev
```

## State shape

The whole app state lives in one JSONB row:

```json
{
  "durations": { "pomodoro": 25, "short": 5, "long": 15, "interval": 4 },
  "bg": { "type": "preset", "id": "aurora" },
  "bgImage": null,
  "tasks": [{ "id": "...", "text": "...", "done": false }],
  "currentTaskId": null,
  "notes": "",
  "completedPomodoros": 0,
  "updatedAt": 1700000000000
}
```

Sync strategy: **last-write-wins** using `updatedAt`. The client pulls on load
and on window focus, and pushes debounced writes on local changes. The running
timer itself is per-device runtime state and is not synced.
