// Single source of truth for synced state, plus the last-write-wins sync loop.
//
// `state` is never reassigned — only mutated in place — so every module can hold
// the same reference. Mutate it, then call commit() (save + re-render) or
// save() (persist only, for high-frequency inputs like the notes field).

import { api } from './api.js';

export const DEFAULTS = {
  durations: { pomodoro: 25, short: 5, long: 15, interval: 4 },
  autoStartBreaks: false,          // start the break when a focus session ends
  notify: false,                   // system notification when an interval ends
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
  wallpaper: {                        // mesh | image | folder — folder handle is local
    mode: 'mesh',
    url: '',
    interval: 5,                      // minutes; 0 = only when the tab opens
  },
  showQuote: true,
  useFavicons: false,
  intention: '',                      // one line for the day; cleared at midnight
  later: [],                          // [{ id, text }] — parked, not today's queue
  taskDay: '',                        // YYYY-MM-DD of the last midnight rollover
  carryTasks: true,                   // unfinished today-tasks survive midnight
  doneToday: 0,                       // tasks marked done since rollover
  updatedAt: 0,
};

// Deriving the sync whitelist from DEFAULTS means a new field can never be
// silently dropped on write the way a hand-maintained list allows.
const SYNCED_KEYS = Object.keys(DEFAULTS);

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_KEY = 'homepage.state-cache.v1';
const RETRY_MAX_MS = 30_000;

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
let localRevision = 0;
let pushTimer = null;
let retryMs = 1_000;

export const syncStatus = {
  phase: 'idle', // idle | saving | synced | offline | error
  backupAvailable: true,
};
const syncListeners = new Set();

export function subscribeSync(fn) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

function setSyncStatus(phase, changes = {}) {
  syncStatus.phase = phase;
  Object.assign(syncStatus, changes);
  for (const fn of syncListeners) {
    try { fn(syncStatus); } catch (e) { console.error('sync status listener failed', e); }
  }
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

const handlers = { onUnauthed: () => {} };
export function setUnauthedHandler(fn) { handlers.onUnauthed = fn; }

function adoptState(incoming) {
  const next = mergeDefaults(incoming);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  pruneSessions();
  const prunedEmptyEntries = pruneEmptyEntries();
  serverTs = state.updatedAt || 0;
  return applyDayRollover(state) || prunedEmptyEntries;
}

export function replaceState(incoming) {
  dirty = false;
  if (adoptState(incoming)) markDirty();
  else {
    persistLocalSnapshot();
    setSyncStatus('synced');
  }
}

/** Prefer a locally dirty snapshot to remote state. This makes a tab closed
 *  during a failed/debounced write recover on its next open. */
export function initializeState(incoming) {
  const cached = readLocalSnapshot();
  if (cached && cached.dirty) {
    adoptState(cached.state);
    serverTs = Number(cached.serverTs) || state.updatedAt || 0;
    localRevision = Math.max(1, Number(cached.revision) || 1);
    dirty = true;
    persistLocalSnapshot();
    setSyncStatus(isOffline() ? 'offline' : 'saving');
    schedulePush(0);
    return;
  }
  replaceState(incoming || {});
}

/** Restore any cached state when the server is temporarily unreachable. */
export function initializeCachedState() {
  const cached = readLocalSnapshot();
  if (!cached) return false;
  const rolled = adoptState(cached.state);
  serverTs = Number(cached.serverTs) || state.updatedAt || 0;
  localRevision = Math.max(0, Number(cached.revision) || 0);
  dirty = Boolean(cached.dirty) || rolled;
  if (rolled) localRevision += 1;
  persistLocalSnapshot();
  setSyncStatus('offline');
  if (dirty) schedulePush();
  return true;
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

function pruneEmptyEntries() {
  const favorites = state.favorites.length;
  const stations = state.stations.length;
  state.favorites = state.favorites.filter(f => f && String(f.label || f.url || '').trim());
  state.stations = state.stations.filter(s => s && String(s.label || s.url || '').trim());
  return favorites !== state.favorites.length || stations !== state.stations.length;
}

/** Local calendar day as YYYY-MM-DD. */
export function todayKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Tick the day over: drop finished today-tasks, carry or park the rest,
 * clear the intention. First run after the field is introduced only stamps
 * the date so existing queues aren't wiped. Mutates `s`; returns whether
 * anything changed.
 */
export function applyDayRollover(s, today = todayKey()) {
  if (!Array.isArray(s.later)) s.later = [];
  if (!Array.isArray(s.tasks)) s.tasks = [];
  if (s.taskDay === today) return false;

  if (!s.taskDay) {
    s.taskDay = today;
    if (!s.doneToday) s.doneToday = s.tasks.filter(t => t && t.done).length;
    return true;
  }

  const undone = s.tasks.filter(t => t && !t.done);
  if (s.carryTasks !== false) {
    s.tasks = undone;
  } else {
    for (const t of undone) {
      const parked = { id: t.id, text: t.text };
      if (t.est) { parked.est = t.est; parked.spent = t.spent || 0; }
      s.later.push(parked);
    }
    s.tasks = [];
  }

  s.intention = '';
  s.doneToday = 0;
  s.taskDay = today;

  if (s.currentTaskId && !s.tasks.some(t => t.id === s.currentTaskId)) {
    const next = s.tasks.find(t => !t.done);
    s.currentTaskId = next ? next.id : null;
  }
  return true;
}

/** Rollover if the local date has changed, then persist and re-render. */
export function ensureDay() {
  if (applyDayRollover(state)) commit();
}

function readLocalSnapshot() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || cached.version !== 1 || !cached.state || typeof cached.state !== 'object') return null;
    return cached;
  } catch {
    return null;
  }
}

function persistLocalSnapshot() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version: 1,
      state: getSyncedState(),
      dirty,
      serverTs,
      revision: localRevision,
    }));
    if (!syncStatus.backupAvailable) setSyncStatus(syncStatus.phase, { backupAvailable: true });
  } catch {
    if (syncStatus.backupAvailable) setSyncStatus(syncStatus.phase, { backupAvailable: false });
  }
}

function markDirty() {
  dirty = true;
  localRevision += 1;
  persistLocalSnapshot();
  setSyncStatus(isOffline() ? 'offline' : 'saving');
  schedulePush();
}

export function schedulePush(delay = 800) {
  if (!dirty) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, delay);
}

/** Persist without re-rendering — for inputs the user is actively typing into. */
export function save() { markDirty(); }

/** Persist and re-render every subscriber. The default for discrete actions. */
export function commit() { markDirty(); render(); }

export async function pushState() {
  pushTimer = null;
  if (writeInFlight || !dirty) return;
  writeInFlight = true;
  const sentRevision = localRevision;
  const snapshot = clone(getSyncedState());
  let authLost = false;
  setSyncStatus(isOffline() ? 'offline' : 'saving');
  try {
    const res = await api.putState(snapshot);
    if (!res.authed) {
      authLost = true;
      setSyncStatus('idle');
      handlers.onUnauthed();
      return;
    }
    serverTs = (res.state && res.state.updatedAt) || serverTs;
    state.updatedAt = serverTs;
    retryMs = 1_000;
    if (localRevision === sentRevision) {
      dirty = false;
      setSyncStatus('synced');
    }
    persistLocalSnapshot();
  } catch (e) {
    console.warn('push failed', e);
    setSyncStatus(isOffline() ? 'offline' : 'error');
    schedulePush(retryMs);
    retryMs = Math.min(RETRY_MAX_MS, retryMs * 2);
  } finally {
    writeInFlight = false;
    if (!authLost && dirty && !pushTimer) schedulePush(localRevision === sentRevision ? retryMs : 0);
  }
}

export async function pullState() {
  // A server timestamp cannot express a local edit that has not reached the
  // server yet. Never replace such an edit with a pull.
  if (writeInFlight || dirty) return;
  try {
    const res = await api.getState();
    if (!res.authed) { handlers.onUnauthed(); return; }
    const remoteTs = (res.state && res.state.updatedAt) || 0;
    if (remoteTs > serverTs) {
      replaceState(res.state);
      render();
    }
    if (syncStatus.phase !== 'synced') setSyncStatus('synced');
  } catch (e) {
    console.warn('pull failed', e);
    setSyncStatus(isOffline() ? 'offline' : 'error');
  }
}

export function retrySyncNow() {
  retryMs = 1_000;
  if (dirty) schedulePush(0);
  else pullState();
}
