import { state, commit, subscribe } from './store.js';
import { SOUNDS, playSound, syncToDurations, requestNotificationPermission } from './pomodoro.js';
import { ENGINES, BANGS } from './search.js';
import { mountFavoritesEditor } from './favorites.js';
import { mountStationsEditor } from './stations.js';
import {
  status as spotifyStatus,
  connect as spotifyConnect,
  disconnect as spotifyDisconnect,
} from './spotify.js';
import { geocode, refreshWeather } from './weather.js';
import { applyTheme } from './theme.js';
import { keysMarkup } from './keys.js';
import {
  WALLPAPER_MODES, SLIDE_INTERVALS, canPickFolder,
  applyWallpaper, choosePicture, chooseFolder,
  clearLocalPicture, clearFolder, wallpaperStatus,
} from './wallpaper.js';

const $ = (id) => document.getElementById(id);

function clamp(value, lo, hi, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function mountSettings({ onSearchChange = () => {}, onLogout = () => {} } = {}) {
  const dialog = $('settings');
  let repaintPending = false;

  fillOptions($('sound-select'), SOUNDS.map(s => [s.id, s.name]));
  fillOptions($('engine-select'), ENGINES.map(e => [e.id, e.name]));
  fillOptions($('wallpaper-mode'), WALLPAPER_MODES.map(m => [m.id, m.name]));
  fillOptions($('wallpaper-interval'), SLIDE_INTERVALS.map(i => [String(i.id), i.name]));
  $('keys-settings').innerHTML = keysMarkup();
  if (!canPickFolder()) {
    const folderOpt = $('wallpaper-mode').querySelector('option[value="folder"]');
    if (folderOpt) folderOpt.disabled = true;
  }

  $('settings-open').addEventListener('click', () => {
    paint();
    dialog.showModal();
    paintSpotify();
  });
  dialog.addEventListener('pointerdown', (e) => {
    const box = dialog.getBoundingClientRect();
    const outside = e.clientX < box.left || e.clientX > box.right
      || e.clientY < box.top || e.clientY > box.bottom;
    if (outside) dialog.close();
  });

  // ---------- Timer ----------
  bindNumber('dur-pomodoro', 1, 180, v => { state.durations.pomodoro = v; syncToDurations(); });
  bindNumber('dur-short',    1, 60,  v => { state.durations.short = v; syncToDurations(); });
  bindNumber('dur-long',     1, 60,  v => { state.durations.long = v; syncToDurations(); });
  bindNumber('dur-interval', 2, 12,  v => { state.durations.interval = v; });

  $('sound-select').addEventListener('change', (e) => { state.sound = e.target.value; commit(); });
  $('sound-preview').addEventListener('click', () => playSound($('sound-select').value));
  $('auto-breaks').addEventListener('change', (e) => {
    state.autoStartBreaks = e.target.checked;
    commit();
  });
  // state.notify is the synced intent; Notification.permission lives per
  // device and never syncs. So the checkbox shows intent while the note
  // below says whether *this* device can actually deliver.
  $('notify-toggle').addEventListener('change', async (e) => {
    if (!e.target.checked) {
      state.notify = false;
      $('notify-note').textContent = '';
      commit();
      return;
    }
    const perm = await requestNotificationPermission();
    if (perm === 'granted') {
      state.notify = true;
      $('notify-note').textContent = '';
      commit();
      return;
    }
    // This device refused: leave the synced intent alone so other devices
    // keep notifying, and say so instead of silently unchecking.
    e.target.checked = state.notify;
    $('notify-note').textContent = perm === 'unsupported'
      ? 'This browser cannot show notifications.'
      : state.notify
        ? 'Blocked on this device — allow them in the browser to get pings here too. Other devices still notify.'
        : 'Blocked on this device — allow them in the browser, then try again.';
  });

  // ---------- Appearance ----------
  $('ground-mode').addEventListener('change', (e) => {
    state.ground.mode = e.target.value;
    applyTheme();
    commit();
  });

  $('wallpaper-mode').addEventListener('change', async (e) => {
    state.wallpaper.mode = e.target.value;
    commit();
    paintWallpaper();
    await applyWallpaper();
    paintWallpaperNotes();
  });
  $('wallpaper-url').addEventListener('change', async (e) => {
    state.wallpaper.url = e.target.value.trim();
    if (state.wallpaper.url) state.wallpaper.mode = 'image';
    commit();
    paintWallpaper();
    await applyWallpaper();
    paintWallpaperNotes();
  });
  $('wallpaper-interval').addEventListener('change', async (e) => {
    state.wallpaper.interval = Number(e.target.value) || 0;
    commit();
    await applyWallpaper();
    paintWallpaperNotes();
  });
  $('wallpaper-pick-file').addEventListener('click', async () => {
    await choosePicture();
    paintWallpaper();
    paintWallpaperNotes();
  });
  $('wallpaper-clear-file').addEventListener('click', async () => {
    await clearLocalPicture();
    paintWallpaperNotes();
  });
  $('wallpaper-pick-folder').addEventListener('click', async () => {
    await chooseFolder();
    paintWallpaper();
    paintWallpaperNotes();
  });
  $('wallpaper-clear-folder').addEventListener('click', async () => {
    await clearFolder();
    paintWallpaper();
    paintWallpaperNotes();
  });

  // ---------- Search ----------
  $('engine-select').addEventListener('change', (e) => {
    state.search.engine = e.target.value;
    commit();
    onSearchChange();
  });

  $('bang-note').textContent =
    'A prefix sends the query elsewhere: gh homepage, yt lo-fi, w stockholm. ' +
    'Short ones need a bang (' +
    BANGS.filter(b => !b.bare).map(b => '!' + b.id).join(' ') +
    '). The box shows where it will go. ' +
    'Commands stay on this page: t task adds to Today, tl task parks for Later, ' +
    'n line appends a note, timer 25 starts a 25-minute focus, and 2+2 answers inline.';

  // ---------- Tasks ----------
  $('carry-tasks').addEventListener('change', (e) => {
    state.carryTasks = e.target.checked;
    commit();
  });

  // ---------- Weather ----------
  const results = $('weather-results');
  const note = $('weather-current');

  $('weather-search').addEventListener('click', async () => {
    const q = $('weather-query').value.trim();
    if (!q) return;
    results.textContent = 'Looking…';
    try {
      const places = await geocode(q);
      results.innerHTML = '';
      if (places.length === 0) {
        results.textContent = 'No match. Try a nearby larger town.';
        return;
      }
      for (const place of places) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'result';
        b.textContent = place.label;
        b.addEventListener('click', () => {
          state.weather = { lat: place.lat, lon: place.lon, label: place.name };
          commit();
          refreshWeather();
          results.innerHTML = '';
          $('weather-query').value = '';
          paintWeatherNote();
        });
        results.append(b);
      }
    } catch {
      results.textContent = 'Could not reach the weather service.';
    }
  });
  $('weather-clear').addEventListener('click', () => {
    state.weather = { lat: null, lon: null, label: '' };
    commit();
    refreshWeather();
    results.innerHTML = '';
    paintWeatherNote();
  });

  function devicePermission() {
    try {
      if (typeof Notification === 'undefined') return 'unsupported';
      return Notification.permission;
    } catch { return 'denied'; }
  }

  function paintNotifyNote() {
    if (!state.notify) { $('notify-note').textContent = ''; return; }
    $('notify-note').textContent = devicePermission() === 'granted'
      ? ''
      : 'On — but this device is not allowed to show them, so pings land on your other devices.';
  }

  function paintWeatherNote() {
    note.textContent = state.weather && state.weather.label
      ? `Showing weather for ${state.weather.label}.`
      : 'No location set.';
  }

  function paintWallpaper() {
    const mode = state.wallpaper?.mode || 'mesh';
    $('wallpaper-mode').value = mode;
    $('wallpaper-url').value = state.wallpaper?.url || '';
    $('wallpaper-interval').value = String(state.wallpaper?.interval ?? 5);
    $('wallpaper-image').hidden = mode !== 'image';
    $('wallpaper-folder').hidden = mode !== 'folder';
  }

  function paintWallpaperNotes() {
    const s = wallpaperStatus();
    $('wallpaper-image-note').textContent = (state.wallpaper?.mode === 'image' && s.text) ? s.text : '';
    $('wallpaper-folder-note').textContent = (state.wallpaper?.mode === 'folder' && s.text) ? s.text : '';
  }

  // ---------- Favorites & stations ----------
  $('use-favicons').addEventListener('change', (e) => {
    state.useFavicons = e.target.checked;
    commit();
  });

  $('spotify-connect').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    if (btn.dataset.action === 'disconnect') await spotifyDisconnect();
    else await spotifyConnect();
    btn.disabled = false;
    paintSpotify();
  });

  // Only runs when the dialog opens, so it costs nothing on page load.
  async function paintSpotify() {
    const label = $('spotify-state');
    const btn = $('spotify-connect');
    label.textContent = 'Checking Spotify…';
    btn.hidden = true;

    const { connected, scopeStale } = await spotifyStatus();
    btn.hidden = false;
    if (connected && scopeStale) {
      label.textContent = 'Connected, but new permissions need approving.';
      btn.textContent = 'Reconnect';
      btn.dataset.action = 'connect';
    } else if (connected) {
      label.textContent = 'Connected. Music plays here with full controls.';
      btn.textContent = 'Disconnect';
      btn.dataset.action = 'disconnect';
    } else {
      label.textContent = 'Not connected, so Spotify links use the basic embed.';
      btn.textContent = 'Connect';
      btn.dataset.action = 'connect';
    }
  }

  $('logout-btn').addEventListener('click', () => { dialog.close(); onLogout(); });

  function paint() {
    $('dur-pomodoro').value = state.durations.pomodoro;
    $('dur-short').value = state.durations.short;
    $('dur-long').value = state.durations.long;
    $('dur-interval').value = state.durations.interval;
    $('sound-select').value = state.sound || 'chime';
    $('auto-breaks').checked = !!state.autoStartBreaks;
    $('notify-toggle').checked = !!state.notify;
    paintNotifyNote();

    $('ground-mode').value = state.ground.mode || 'auto';
    paintWallpaper();
    paintWallpaperNotes();

    $('engine-select').value = state.search.engine || 'duckduckgo';
    $('carry-tasks').checked = state.carryTasks !== false;
    $('use-favicons').checked = !!state.useFavicons;

    paintWeatherNote();
    mountFavoritesEditor($('favorites-editor'));
    mountStationsEditor($('stations-editor'));
  }

  paint();
  subscribe(() => {
    if (!dialog.open) return;
    const focused = dialog.contains(document.activeElement) ? document.activeElement : null;
    if (!focused) {
      paint();
      return;
    }
    if (repaintPending) return;
    repaintPending = true;
    focused.addEventListener('blur', () => {
      repaintPending = false;
      if (dialog.open) paint();
    }, { once: true });
  });
}

function bindNumber(id, lo, hi, apply) {
  const el = document.getElementById(id);
  el.addEventListener('change', () => {
    const value = clamp(el.value, lo, hi, Number(el.value) || lo);
    el.value = value;
    apply(value);
    commit();
  });
}

function fillOptions(select, pairs) {
  select.innerHTML = '';
  for (const [value, label] of pairs) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.append(opt);
  }
}
