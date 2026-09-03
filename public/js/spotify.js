// Spotify Connect — auth plus the Web Playback SDK.
//
// This makes the page a Spotify device rather than an embedder, which is the
// only way to get volume, shuffle and repeat: the iframe embed keeps its
// controls inside its own origin. Premium is required, and so is Widevine, so
// callers must ask isSupported() and fall back to the embed when it is false.
//
// The SDK script is fetched on the first play and never on load — this page is
// a new-tab page, so a third-party request on boot would be a regression.
//
// Worth knowing: the SDK object is thin. It can pause, seek, skip and set
// volume, but starting playback and setting shuffle or repeat are Web API calls
// that each need the device id. The SDK only steers what is already loaded.

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const API = 'https://api.spotify.com/v1/';
const VOLUME_KEY = 'homepage.spotify.volume';

// The SDK cannot play podcasts, whatever the URI says.
const SDK_TYPES = new Set(['track', 'album', 'playlist', 'artist']);

let token = null;
let tokenExpiry = 0;
let sdkLoading = null;
let player = null;
let deviceId = null;
let ready = null;
let supported = null;
let lastState = null;
let lastStateAt = 0;
const listeners = new Set();

class NotConnected extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(lastState); } catch (e) { console.warn('spotify listener failed', e); }
  }
}

// ---------- connection ----------

async function post(action) {
  const r = await fetch('/api/spotify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return r;
}

export async function status() {
  try {
    const r = await post('status');
    if (!r.ok) return { connected: false };
    return await r.json();
  } catch {
    return { connected: false };
  }
}

/** Open the consent popup. Resolves true once it reports success.
 *  A popup rather than a navigation: leaving the page would reset a running
 *  pomodoro and stop any playing YouTube embed. */
export function connect() {
  return new Promise((resolve) => {
    const win = window.open('/api/spotify', 'spotify-auth', 'width=520,height=720');
    if (!win) return resolve(false);

    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      resolve(ok);
    };
    const onMessage = (e) => {
      if (e.origin !== location.origin || !e.data || !e.data.spotify) return;
      finish(e.data.spotify === 'ok');
    };
    window.addEventListener('message', onMessage);
    // The popup can be closed by hand, in which case no message ever arrives.
    const poll = setInterval(() => { if (win.closed) finish(false); }, 500);
  });
}

function teardownPlayer() {
  if (player) player.disconnect();
  player = null;
  deviceId = null;
  ready = null;
  lastState = null;
  emit();
}

export async function disconnect() {
  await post('disconnect').catch(() => {});
  token = null;
  tokenExpiry = 0;
  teardownPlayer();
}

/** Access tokens live for an hour. Cached until a minute before expiry, and
 *  re-fetched rather than closed over, because the SDK calls back for a fresh
 *  one whenever it hits a 401. */
async function getToken() {
  if (token && Date.now() < tokenExpiry) return token;
  const r = await post('token');
  if (r.status === 409) {
    token = null;
    throw new NotConnected('spotify not connected');
  }
  if (!r.ok) throw new Error('spotify token failed');
  const d = await r.json();
  token = d.accessToken;
  tokenExpiry = Date.now() + Math.max(30, (d.expiresIn || 3600) - 60) * 1000;
  return token;
}

// ---------- capability ----------

export function canPlay(type) {
  return SDK_TYPES.has(type);
}

/** Playback is DRM-gated, so no Widevine means no SDK — true on every mobile
 *  browser and on Chromium builds without it. */
export async function isSupported() {
  if (supported !== null) return supported;
  if (!navigator.requestMediaKeySystemAccess) {
    supported = false;
    return supported;
  }
  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
      initDataTypes: ['cenc'],
      audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
    }]);
    supported = true;
  } catch {
    supported = false;
  }
  return supported;
}

// ---------- the player ----------

function loadSdk() {
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve, reject) => {
    // The SDK looks for this on window. A module's top level is not global, so
    // it has to be assigned explicitly, and before the script runs.
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => reject(new Error('spotify sdk blocked'));
    document.head.append(s);
  });
  return sdkLoading;
}

export function storedVolume() {
  const v = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.6;
}

async function ensurePlayer() {
  if (ready) return ready;
  ready = (async () => {
    await loadSdk();
    player = new window.Spotify.Player({
      name: 'Homepage',
      getOAuthToken: (cb) => {
        getToken().then(cb).catch((e) => {
          cb('');
          // A missing grant is terminal. Without tearing the player down here
          // the SDK retries authentication forever against a token that will
          // never arrive.
          if (e instanceof NotConnected) teardownPlayer();
        });
      },
      volume: storedVolume(),
    });

    player.addListener('player_state_changed', (s) => {
      // null means playback moved to another device. Every tab of this page
      // that plays registers its own device, so this includes a second tab.
      lastState = s ? normalize(s) : null;
      lastStateAt = performance.now();
      emit();
    });
    player.addListener('not_ready', () => { deviceId = null; });
    for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) {
      player.addListener(ev, ({ message }) => console.warn(`spotify ${ev}`, message));
    }

    const id = await new Promise((resolve, reject) => {
      // If the SDK neither readies nor errors, this would stay pending and the
      // caller could never fall back to the embed.
      const bail = setTimeout(() => reject(new Error('spotify sdk timed out')), 15000);
      const settle = (fn) => (arg) => { clearTimeout(bail); fn(arg); };
      player.addListener('ready', settle(({ device_id }) => resolve(device_id)));
      player.addListener('initialization_error', settle(({ message }) => reject(new Error(message))));
      player.addListener('account_error', settle(() => reject(new Error('premium required'))));
      player.connect().then((ok) => { if (!ok) settle(reject)(new Error('spotify connect refused')); });
    });
    deviceId = id;
    return id;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

function normalize(s) {
  const t = s.track_window && s.track_window.current_track;
  const art = t && t.album && t.album.images ? t.album.images : [];
  return {
    paused: s.paused,
    position: s.position,
    duration: s.duration,
    shuffle: s.shuffle,
    repeat: s.repeat_mode, // 0 off, 1 context, 2 track
    disallows: s.disallows || {},
    track: t ? {
      name: t.name,
      artists: (t.artists || []).map((a) => a.name).join(', '),
      art: (art[art.length - 1] || {}).url || '',
    } : null,
  };
}

/** The SDK reports position only when something changes, so between events it
 *  has to be interpolated or the progress bar sits still. */
export function currentPosition() {
  if (!lastState) return 0;
  if (lastState.paused) return lastState.position;
  const drift = performance.now() - lastStateAt;
  return Math.min(lastState.duration, lastState.position + drift);
}

export function getState() {
  return lastState;
}

/** Resync after a spell in the background, where timers are throttled to about
 *  once a minute and the interpolation above drifts badly. */
export async function resync() {
  if (!player) return;
  const s = await player.getCurrentState();
  lastState = s ? normalize(s) : null;
  lastStateAt = performance.now();
  emit();
}

// ---------- web api ----------

async function webApi(path, { method = 'PUT', body, withDevice = true } = {}) {
  const t = await getToken();
  const sep = path.includes('?') ? '&' : '?';
  const qs = withDevice && deviceId ? `${sep}device_id=${encodeURIComponent(deviceId)}` : '';
  return fetch(`${API}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Called synchronously from the click that starts playback, before any await,
 *  or the browser's autoplay policy blocks the first play outright. */
export function activate() {
  if (player && player.activateElement) {
    try { player.activateElement(); } catch { /* not fatal */ }
  }
}

export async function start(uri, type) {
  await ensurePlayer();
  const body = type === 'track' ? { uris: [uri] } : { context_uri: uri };

  // 'ready' fires before the Web API can see the device, so the first play
  // usually 404s. Back off and retry rather than surfacing that as a failure.
  for (let i = 0; i < 5; i += 1) {
    const r = await webApi('me/player/play', { body });
    if (r.ok || r.status === 204) return;
    if (r.status === 404) {
      await sleep(250 * 2 ** i);
      continue;
    }
    if (r.status === 403) throw new Error('spotify premium required');
    throw new Error(`spotify play failed (${r.status})`);
  }
  throw new Error('spotify device never became available');
}

export async function togglePlay() { if (player) await player.togglePlay(); }
export async function next() { if (player) await player.nextTrack(); }
export async function previous() { if (player) await player.previousTrack(); }
export async function seek(ms) { if (player) await player.seek(Math.max(0, Math.round(ms))); }

export async function setVolume(v) {
  const clamped = Math.min(1, Math.max(0, v));
  localStorage.setItem(VOLUME_KEY, String(clamped));
  if (player) await player.setVolume(clamped);
}

export async function setShuffle(on) {
  await webApi(`me/player/shuffle?state=${on ? 'true' : 'false'}`, { method: 'PUT' });
}

export async function setRepeat(mode) {
  await webApi(`me/player/repeat?state=${mode}`, { method: 'PUT' });
}

export async function pause() { if (player) await player.pause(); }
