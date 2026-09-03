// Spotify OAuth and access tokens.
//
// The refresh token is the long-lived credential, so it stays here and never
// reaches the browser. The page asks this endpoint for a short-lived access
// token instead. That is also why the authorization code is redeemed server
// side: the redirect target is this function, not the page, so the code never
// touches page JS and there is no ?code= left in the address bar to reload.
//
// The redirect lands in a popup opened by the page. Navigating the page itself
// would reset a running pomodoro — the timer is in-memory and unsynced — and
// kill any playing YouTube embed.

import { sql, ensureSpotifySchema } from './_lib/db.js';
import {
  verifyToken,
  parseCookies,
  COOKIE_NAME,
  signStateToken,
  verifyStateToken,
} from './_lib/auth.js';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';

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

function redirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}/api/spotify`;
}

function basicAuth() {
  const pair = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(pair).toString('base64')}`;
}

/** Ask Spotify for tokens. Returns { ok, data } or { ok: false, revoked } so the
 *  caller can tell "reconnect" apart from "try again later". */
async function tokenRequest(form) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, data };
  return { ok: false, revoked: data.error === 'invalid_grant', data };
}

/** The popup's last act. Closes itself and tells the opener how it went. */
function popupClose(res, status) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(
    `<!doctype html><meta charset="utf-8"><title>Spotify</title>` +
    `<body style="background:#160f2b;color:#fff;font:14px system-ui;padding:24px">` +
    `<p>${status === 'ok' ? 'Connected. You can close this window.' : 'Spotify connection failed.'}</p>` +
    `<script>try{window.opener&&window.opener.postMessage({spotify:${JSON.stringify(status)}},location.origin)}catch(e){}window.close()</script>`
  );
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error: 'auth' });

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'server-config' });
  }

  try {
    await ensureSpotifySchema();
  } catch (e) {
    console.error('ensureSpotifySchema failed', e);
    return res.status(500).json({ error: 'db' });
  }

  if (req.method === 'GET') {
    const { code, state, error } = req.query || {};

    // Leg 1: no code yet, so send the popup to Spotify's consent screen.
    if (!code && !error) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: SCOPES,
        redirect_uri: redirectUri(req),
        state: signStateToken({ exp: Date.now() + STATE_TTL_MS }),
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, `${AUTHORIZE_URL}?${params}`);
    }

    // Leg 2: Spotify redirected back here.
    if (error) return popupClose(res, 'denied');
    if (!verifyStateToken(state)) return popupClose(res, 'bad-state');

    const out = await tokenRequest({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri(req),
    });
    if (!out.ok) {
      console.error('spotify code exchange failed', out.data);
      return popupClose(res, 'failed');
    }

    try {
      await sql`
        INSERT INTO spotify_auth (id, refresh_token, scope, updated_at)
        VALUES (1, ${out.data.refresh_token}, ${out.data.scope || ''}, now())
        ON CONFLICT (id) DO UPDATE
          SET refresh_token = EXCLUDED.refresh_token,
              scope         = EXCLUDED.scope,
              updated_at    = now()
      `;
    } catch (e) {
      console.error('spotify token store failed', e);
      return popupClose(res, 'failed');
    }
    return popupClose(res, 'ok');
  }

  if (req.method === 'POST') {
    const { action } = json(req);

    if (action === 'status') {
      try {
        const { rows } = await sql`SELECT scope FROM spotify_auth WHERE id = 1`;
        if (!rows[0]) return res.status(200).json({ connected: false });
        const have = new Set(String(rows[0].scope || '').split(' ').filter(Boolean));
        const stale = SCOPES.split(' ').some((s) => !have.has(s));
        return res.status(200).json({ connected: true, scopeStale: stale });
      } catch (e) {
        console.error('spotify status failed', e);
        return res.status(500).json({ error: 'db' });
      }
    }

    if (action === 'disconnect') {
      try {
        await sql`DELETE FROM spotify_auth WHERE id = 1`;
        return res.status(200).json({ connected: false });
      } catch (e) {
        console.error('spotify disconnect failed', e);
        return res.status(500).json({ error: 'db' });
      }
    }

    if (action === 'token') {
      let row;
      try {
        const { rows } = await sql`SELECT refresh_token FROM spotify_auth WHERE id = 1`;
        row = rows[0];
      } catch (e) {
        console.error('spotify token read failed', e);
        return res.status(500).json({ error: 'db' });
      }
      if (!row) return res.status(409).json({ error: 'not-connected' });

      const out = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
      });

      // A revoked grant is terminal: drop the row and say so distinctly, so the
      // page can offer a reconnect once instead of retrying forever.
      if (!out.ok && out.revoked) {
        try {
          await sql`DELETE FROM spotify_auth WHERE id = 1`;
        } catch (e) {
          console.error('spotify revoked cleanup failed', e);
        }
        return res.status(409).json({ error: 'not-connected' });
      }
      if (!out.ok) {
        console.error('spotify refresh failed', out.data);
        return res.status(502).json({ error: 'upstream' });
      }

      // Spotify may rotate the refresh token; keep the newest one.
      if (out.data.refresh_token) {
        try {
          await sql`
            UPDATE spotify_auth
            SET refresh_token = ${out.data.refresh_token}, updated_at = now()
            WHERE id = 1
          `;
        } catch (e) {
          console.error('spotify token rotation failed', e);
        }
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        accessToken: out.data.access_token,
        expiresIn: out.data.expires_in,
      });
    }

    return res.status(400).json({ error: 'invalid' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method' });
}
