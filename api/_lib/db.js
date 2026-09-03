import { sql } from '@vercel/postgres';

let schemaEnsured = false;

export async function ensureSchema() {
  if (schemaEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS state (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      data        JSONB    NOT NULL DEFAULT '{}'::jsonb,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    INSERT INTO state (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip           TEXT PRIMARY KEY,
      fails        INTEGER     NOT NULL DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
      locked_until TIMESTAMPTZ
    )
  `;
  schemaEnsured = true;
}

let spotifySchemaEnsured = false;

// Deliberately not part of ensureSchema(): that runs on the login path, and a
// failure in this DDL would lock the owner out over a feature they may not even
// use. Only api/spotify.js needs this table, so only it pays for it.
//
// scope is stored with the token because adding a scope later leaves the old
// refresh token silently lacking it — the symptom is a permanent 403 with
// nothing to point at. Comparing it lets the UI ask for a reconnect instead.
export async function ensureSpotifySchema() {
  if (spotifySchemaEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS spotify_auth (
      id            INTEGER PRIMARY KEY DEFAULT 1,
      refresh_token TEXT        NOT NULL,
      scope         TEXT        NOT NULL DEFAULT '',
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT spotify_auth_singleton CHECK (id = 1)
    )
  `;
  spotifySchemaEnsured = true;
}

export { sql };
