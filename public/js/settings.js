import { state, commit } from './store.js';
import { SOUNDS, playSound, syncToDurations } from './pomodoro.js';
import { ENGINES, BANGS } from './search.js';
import { mountFavoritesEditor } from './favorites.js';
import { mountStationsEditor } from './stations.js';
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

export function mountSettings({ onSearchChange = () => {}, onQuoteChange = () => {}, onLogout = () => {} } = {}) {
  const dialog = $('settings');

  fillOptions($('sound-select'), SOUNDS.map(s => [s.id, s.name]));
  fillOptions($('engine-select'), ENGINES.map(e => [e.id, e.name]));
  fillOptions($('wallpaper-mode'), WALLPAPER_MODES.map(m => [m.id, m.name]));
  fillOptions($('wallpaper-interval'), SLIDE_INTERVALS.map(i => [String(i.id), i.name]));
  $('keys-settings').innerHTML = keysMarkup();
  if (!canPickFolder()) {
    const folderOpt = $('wallpaper-mode').querySelector('option[value="folder"]');
    if (folderOpt) folderOpt.disabled = true;
  }

  $('settings-open').addEventListener('click', () => { paint(); dialog.showModal(); });

  // ---------- Timer ----------
  bindNumber('dur-pomodoro', 1, 180, v => { state.durations.pomodoro = v; syncToDurations(); });
  bindNumber('dur-short',    1, 60,  v => { state.durations.short = v; syncToDurations(); });
  bindNumber('dur-long',     1, 60,  v => { state.durations.long = v; syncToDurations(); });
  bindNumber('dur-interval', 2, 12,  v => { state.durations.interval = v; });

  $('sound-select').addEventListener('change', (e) => { state.sound = e.target.value; commit(); });
  $('sound-preview').addEventListener('click', () => playSound($('sound-select').value));

  // ---------- Appearance ----------
  $('ground-mode').addEventListener('change', (e) => {
    state.ground.mode = e.target.value;
    applyTheme();
    commit();
  });
  $('show-quote').addEventListener('change', (e) => {
    state.showQuote = e.target.checked;
    commit();
    onQuoteChange();
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
    '). The box shows where it will go.';

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

  $('logout-btn').addEventListener('click', () => { dialog.close(); onLogout(); });

  function paint() {
    $('dur-pomodoro').value = state.durations.pomodoro;
    $('dur-short').value = state.durations.short;
    $('dur-long').value = state.durations.long;
    $('dur-interval').value = state.durations.interval;
    $('sound-select').value = state.sound || 'chime';

    $('ground-mode').value = state.ground.mode || 'auto';
    $('show-quote').checked = state.showQuote !== false;
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
