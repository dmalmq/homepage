import crypto from 'node:crypto';
import { signToken, makeCookieHeader, COOKIE_NAME, parseCookies, verifyToken } from './_lib/auth.js';

function json(req, fallback = {}) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return fallback; }
  }
  return fallback;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }

  const { password } = json(req);
  if (!password) return res.status(400).json({ error: 'missing' });

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'server-config' });

  const a = Buffer.from(String(password));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'invalid' });
  }

  // Already authed with a valid, unexpired cookie? Refresh it.
  const cookies = parseCookies(req.headers.cookie);
  const existing = verifyToken(cookies[COOKIE_NAME]);

  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const token = signToken({ exp });
  res.setHeader('Set-Cookie', makeCookieHeader(token));
  return res.status(200).json({ ok: true, refreshed: Boolean(existing) });
}
