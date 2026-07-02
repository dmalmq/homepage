import { makeCookieHeader, COOKIE_NAME } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  // Expire the cookie.
  res.setHeader('Set-Cookie', makeCookieHeader('', 0));
  return res.status(200).json({ ok: true });
}
