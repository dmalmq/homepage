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

const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
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
export async function checkLoginAllowed(ip) {
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT locked_until FROM login_attempts WHERE ip = ${ip}`;
    const lockedUntil = rows[0] && rows[0].locked_until;
    if (lockedUntil) {
      const remainingMs = new Date(lockedUntil).getTime() - Date.now();
      if (remainingMs > 0) {
        return { allowed: false, retryAfterSec: Math.ceil(remainingMs / 1000) };
      }
    }
    return { allowed: true };
  } catch (e) {
    console.warn('rate limit check unavailable, allowing attempt', e);
    return { allowed: true };
  }
}

/**
 * The throttling decision, kept pure so it can be tested without a database.
 * @param row  existing { fails, window_start }, or null/undefined for a first failure
 * @param now  epoch ms
 * @returns {{ fails: number, windowExpired: boolean, lockedUntil: string|null }}
 */
export function nextAttemptState(row, now = Date.now()) {
  const windowExpired = !row
    || (now - new Date(row.window_start).getTime()) > WINDOW_MS;
  const fails = windowExpired ? 1 : Number(row.fails) + 1;
  const lockedUntil = fails >= MAX_FAILS
    ? new Date(now + LOCKOUT_MS).toISOString()
    : null;
  return { fails, windowExpired, lockedUntil };
}

export async function recordFailure(ip) {
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT fails, window_start FROM login_attempts WHERE ip = ${ip}`;
    const { fails, windowExpired, lockedUntil } = nextAttemptState(rows[0]);

    await sql`
      INSERT INTO login_attempts (ip, fails, window_start, locked_until)
      VALUES (${ip}, ${fails}, now(), ${lockedUntil})
      ON CONFLICT (ip) DO UPDATE SET
        fails        = ${fails},
        window_start = CASE WHEN ${windowExpired} THEN now()
                            ELSE login_attempts.window_start END,
        locked_until = ${lockedUntil}
    `;

    // Opportunistic cleanup so the table can't grow without bound.
    await sql`
      DELETE FROM login_attempts
      WHERE window_start < now() - INTERVAL '1 day'
        AND (locked_until IS NULL OR locked_until < now())
    `;

    return { fails, locked: Boolean(lockedUntil) };
  } catch (e) {
    console.warn('could not record login failure', e);
    return { fails: 0, locked: false };
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
