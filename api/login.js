import crypto from 'node:crypto';
import { signToken, makeCookieHeader, COOKIE_NAME, parseCookies, verifyToken } from './_lib/auth.js';
import { clientIp, checkLoginAllowed, recordFailure, clearFailures } from './_lib/ratelimit.js';

function json(req, fallback = {}) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return fallback; }
  }
  return fallback;
}

// Hash both sides to a fixed 32 bytes before comparing. Comparing the raw
// strings needs a length check first, and that early return leaks the
// password's length through response timing.
function matches(candidate, expected) {
  const a = crypto.createHash('sha256').update(String(candidate)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
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

  const ip = clientIp(req);

  const gate = await checkLoginAllowed(ip);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec));
    return res.status(429).json({ error: 'too-many', retryAfterSec: gate.retryAfterSec });
  }

  if (!matches(password, expected)) {
    await recordFailure(ip);
    // Blunt the guess rate even before the lockout threshold is reached.
    await new Promise(resolve => setTimeout(resolve, 400));
    return res.status(401).json({ error: 'invalid' });
  }

  await clearFailures(ip);

  // Already authed with a valid, unexpired cookie? Refresh it.
  const cookies = parseCookies(req.headers.cookie);
  const existing = verifyToken(cookies[COOKIE_NAME]);

  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const token = signToken({ exp });
  res.setHeader('Set-Cookie', makeCookieHeader(token));
  return res.status(200).json({ ok: true, refreshed: Boolean(existing) });
}
