-- Vercel Postgres schema for the homepage app.
-- Run this once in the Vercel dashboard > Storage > your db > Query.
-- (The API also auto-creates the table on first login, so this is optional.)

CREATE TABLE IF NOT EXISTS state (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  data        JSONB    NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO state (id, data)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Per-IP login throttling. See api/_lib/ratelimit.js.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip           TEXT PRIMARY KEY,
  fails        INTEGER     NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);
