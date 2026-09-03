import crypto from 'node:crypto';

const SECRET = process.env.APP_SECRET || 'dev-insecure-secret';

// OAuth state travels through another origin's servers and lands in the address
// bar, browser history and access logs. It is signed with a key derived from
// APP_SECRET rather than APP_SECRET itself, so a leaked state value can never be
// replayed as a session cookie — verifyToken() authenticates any payload it can
// verify, and has no idea what a payload was minted for.
const STATE_KEY = crypto.createHmac('sha256', SECRET).update('spotify-oauth-state').digest();

export const COOKIE_NAME = 'pomo_auth';
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

function sign(key, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(key, token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', key).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signToken(payload) {
  return sign(SECRET, payload);
}

export function verifyToken(token) {
  return verify(SECRET, token);
}

export function signStateToken(payload) {
  return sign(STATE_KEY, payload);
}

export function verifyStateToken(token) {
  return verify(STATE_KEY, token);
}

export function parseCookies(headerValue) {
  const out = {};
  if (!headerValue) return out;
  for (const part of headerValue.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return out;
}

export function makeCookieHeader(value, maxAgeSec = MAX_AGE_SEC) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (process.env.VERCEL_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
