// Per-IP throttling for the login endpoint.
//
// One password on a public URL means an unlimited guess rate is the whole
// attack surface. This caps it.
//
// Deliberately fails OPEN: if the database is unreachable, an attempt is
// allowed through. Login was decoupled from the database on purpose (see the
// git history), and locking the owner out of their own page during a database
// blip is a worse outcome than briefly losing throttling.
//
// Per-IP is the standard trade-off, not a complete defence: an attacker with a
// pool of addresses still gets MAX_FAILS tries each. A global cap would fix
// that and also hand anyone a trivial way to lock the real owner out, so it
// isn't worth it here. The real protection remains a long APP_PASSWORD.

import { sql, ensureSchema } from './db.js';

const MAX_FAILS = 8;

/** Client address. Behind Cloudflare → Vercel the original client is the first
 *  entry in x-forwarded-for. */
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.headers['x-real-ip']
    || (req.socket && req.socket.remoteAddress)
    || 'unknown';
}

/** @returns {{ allowed: boolean, retryAfterSec?: number }} */
export async function reserveLoginAttempt(ip) {
  try {
    await ensureSchema();
    // The row update itself is the gate. PostgreSQL serializes concurrent
    // conflicts on the same IP, so a burst cannot make many requests observe
    // and overwrite the same failure count.
    const { rows } = await sql`
      INSERT INTO login_attempts (ip, fails, window_start, locked_until)
      VALUES (${ip}, 1, now(), NULL)
      ON CONFLICT (ip) DO UPDATE SET
        fails = CASE
          WHEN login_attempts.locked_until IS NOT NULL
            AND login_attempts.locked_until <= now() THEN 1
          WHEN login_attempts.window_start < now() - INTERVAL '15 minutes' THEN 1
          ELSE LEAST(login_attempts.fails + 1, 2147483647)
        END,
        window_start = CASE
          WHEN login_attempts.locked_until IS NOT NULL
            AND login_attempts.locked_until <= now() THEN now()
          WHEN login_attempts.window_start < now() - INTERVAL '15 minutes' THEN now()
          ELSE login_attempts.window_start
        END,
        locked_until = CASE
          WHEN login_attempts.locked_until IS NOT NULL
            AND login_attempts.locked_until > now() THEN login_attempts.locked_until
          WHEN login_attempts.locked_until IS NOT NULL
            AND login_attempts.locked_until <= now() THEN NULL
          WHEN login_attempts.window_start < now() - INTERVAL '15 minutes' THEN NULL
          WHEN login_attempts.fails + 1 >= ${MAX_FAILS}
            THEN now() + INTERVAL '15 minutes'
          ELSE NULL
        END
      RETURNING fails, locked_until
    `;
    const row = rows[0];
    try {
      await sql`
        DELETE FROM login_attempts
        WHERE ip <> ${ip}
          AND window_start < now() - INTERVAL '1 day'
          AND (locked_until IS NULL OR locked_until < now())
      `;
    } catch (e) {
      console.warn('could not clean up old login attempts', e);
    }
    const allowed = Number(row.fails) <= MAX_FAILS;
    if (allowed) return { allowed: true };
    const remainingMs = new Date(row.locked_until).getTime() - Date.now();
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)) };
  } catch (e) {
    console.warn('rate limit check unavailable, allowing attempt', e);
    return { allowed: true };
  }
}

export async function clearFailures(ip) {
  try {
    await ensureSchema();
    await sql`DELETE FROM login_attempts WHERE ip = ${ip}`;
  } catch (e) {
    console.warn('could not clear login failures', e);
  }
}
