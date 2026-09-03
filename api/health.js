// Diagnostic endpoint — visit /api/health to check config.
//
// This is reachable without a session, because the whole point is to diagnose a
// deployment you can't log into yet. So the unauthenticated response carries
// only booleans: enough to answer "is it configured and is the database up",
// and nothing that helps someone attack the login. Details that would —
// the password's length, raw database errors, the Node version — require a
// valid session cookie.

import { verifyToken, parseCookies, COOKIE_NAME } from './_lib/auth.js';

export default async function handler(req, res) {
  const authed = Boolean(verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]));

  let dbOk = false;
  let dbError = null;
  try {
    const { sql, ensureSchema } = await import('./_lib/db.js');
    await ensureSchema();
    await sql`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = (e && e.message ? e.message : String(e)).slice(0, 200);
  }

  const body = {
    passwordConfigured: Boolean(process.env.APP_PASSWORD),
    secretConfigured: Boolean(process.env.APP_SECRET),
    db: dbOk ? 'ok' : 'error',
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
  };

  if (authed) {
    body.runtime = process.version;
    if (dbError) body.dbError = dbError;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(body);
}
