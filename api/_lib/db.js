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
  schemaEnsured = true;
}

export { sql };
