-- Vercel Postgres schema for the Pomodoro app.
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
