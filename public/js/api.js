// Thin fetch client for the three API routes. Unchanged behaviour from the
// pre-split app.js — every call reports auth loss as { authed: false } rather
// than throwing, so callers can route the user back to the login gate.

export const api = {
  async login(password) {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    let body = null;
    try { body = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, error: body && body.error, retryAfterSec: body && body.retryAfterSec };
  },

  async logout() {
    await fetch('/api/logout', { method: 'POST' });
  },

  async getState() {
    const r = await fetch('/api/state', { method: 'GET' });
    if (r.status === 401) return { authed: false };
    if (!r.ok) throw new Error('state get failed');
    const { state } = await r.json();
    return { authed: true, state: state || {} };
  },

  async putState(state) {
    const r = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (r.status === 401) return { authed: false };
    if (!r.ok) throw new Error('state put failed');
    const { state: stamped } = await r.json();
    return { authed: true, state: stamped };
  },
};
