// Single source of truth for synced state, plus the last-write-wins sync loop.
//
// `state` is never reassigned — only mutated in place — so every module can hold
// the same reference. Mutate it, then call commit() (save + re-render) or
// save() (persist only, for high-frequency inputs like the notes field).

import { api } from './api.js';

export const DEFAULTS = {
  durations: { pomodoro: 25, short: 5, long: 15, interval: 4 },
  tasks: [],
  currentTaskId: null,
  notes: '',
  completedPomodoros: 0,
  sessions: [],                       // [{ t: epochMs, minutes }] — drives the session count
  sound: 'chime',
  favorites: [],                      // [{ id, label, url }]
  stations: [],                       // [{ id, kind: 'spotify'|'youtube', label, url }]
  search: { engine: 'duckduckgo' },
  weather: { lat: null, lon: null, label: '' },
  ground: { mode: 'auto' },           // auto | dawn | day | dusk | night
  showQuote: true,
  useFavicons: false,
  updatedAt: 0,
};

// Deriving the sync whitelist from DEFAULTS means a new field can never be
// silently dropped on write the way a hand-maintained list allows.
const SYNCED_KEYS = Object.keys(DEFAULTS);

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const state = {};

export function clone(o) { return JSON.parse(JSON.stringify(o)); }
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Shallow Object.assign would drop sibling keys when the server holds a partial
// nested object (e.g. durations: { pomodoro: 30 }). Merge one level deeper.
function mergeDefaults(incoming) {
  const out = clone(DEFAULTS);
  for (const key of SYNCED_KEYS) {
    const val = incoming && incoming[key];
    if (val === undefined || val === null) continue;
    if (Array.isArray(out[key])) {
      if (Array.isArray(val)) out[key] = clone(val);
    } else if (out[key] && typeof out[key] === 'object') {
      if (typeof val === 'object' && !Array.isArray(val)) Object.assign(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ---------- Subscriptions ----------
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function render() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error('render failed', e); }
  }
}

// ---------- Sync ----------
let serverTs = 0;
let writeInFlight = false;
let dirty = false;
let pushTimer = null;

const handlers = { onUnauthed: () => {} };
export function setUnauthedHandler(fn) { handlers.onUnauthed = fn; }

export function replaceState(incoming) {
  const next = mergeDefaults(incoming);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  pruneSessions();
  serverTs = state.updatedAt || 0;
}

export function getSyncedState() {
  const out = {};
  for (const k of SYNCED_KEYS) out[k] = state[k];
  return out;
}

function pruneSessions() {
  const cutoff = Date.now() - SESSION_RETENTION_MS;
  if (!Array.isArray(state.sessions)) { state.sessions = []; return; }
  state.sessions = state.sessions.filter(s => s && typeof s.t === 'number' && s.t > cutoff);
}

export function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 800);
}

/** Persist without re-rendering — for inputs the user is actively typing into. */
export function save() { schedulePush(); }

/** Persist and re-render every subscriber. The default for discrete actions. */
export function commit() { schedulePush(); render(); }

export async function pushState() {
  if (writeInFlight) { dirty = true; return; }
  writeInFlight = true;
  try {
    const res = await api.putState(getSyncedState());
    if (!res.authed) { handlers.onUnauthed(); return; }
    serverTs = (res.state && res.state.updatedAt) || serverTs;
    state.updatedAt = serverTs;
  } catch (e) {
    console.warn('push failed', e);
  } finally {
    writeInFlight = false;
    if (dirty) { dirty = false; schedulePush(); }
  }
}

export async function pullState({ force = false } = {}) {
  if (writeInFlight && !force) return;
  try {
    const res = await api.getState();
    if (!res.authed) { handlers.onUnauthed(); return; }
    const remoteTs = (res.state && res.state.updatedAt) || 0;
    if (remoteTs > serverTs) {
      replaceState(res.state);
      render();
    }
  } catch (e) {
    console.warn('pull failed', e);
  }
}
