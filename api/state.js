import { sql, ensureSchema } from './_lib/db.js';
import { verifyToken, parseCookies, COOKIE_NAME } from './_lib/auth.js';

function auth(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
}

function json(req, fallback = {}) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return fallback; }
  }
  return fallback;
}

const MAX_STATE_BYTES = 4 * 1024 * 1024; // 4MB guard for serverless payload

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!auth(req)) return res.status(401).json({ error: 'auth' });

  try {
    await ensureSchema();
  } catch (e) {
    console.error('ensureSchema failed', e);
    return res.status(500).json({ error: 'db' });
  }

  if (req.method === 'GET') {
    try {
      const { rows } = await sql`SELECT data FROM state WHERE id = 1`;
      const data = (rows[0] && rows[0].data) || {};
      return res.status(200).json({ state: data });
    } catch (e) {
      console.error('state GET failed', e);
      return res.status(500).json({ error: 'db' });
    }
  }

  if (req.method === 'PUT') {
    const { state } = json(req);
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ error: 'invalid' });
    }
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) {
      return res.status(413).json({ error: 'too-large' });
    }
    const now = Date.now();
    const stamped = { ...state, updatedAt: now };
    try {
      await sql`
        UPDATE state
        SET data = ${JSON.stringify(stamped)}::jsonb, updated_at = now()
        WHERE id = 1
      `;
      return res.status(200).json({ state: stamped });
    } catch (e) {
      console.error('state PUT failed', e);
      return res.status(500).json({ error: 'db' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'method' });
}
