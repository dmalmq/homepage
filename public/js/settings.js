import { state, commit } from './store.js';
import { SOUNDS, playSound, syncToDurations } from './pomodoro.js';
import { ENGINES } from './search.js';
import { mountFavoritesEditor } from './favorites.js';
import { mountStationsEditor } from './stations.js';
import { geocode, refreshWeather } from './weather.js';
import { applyTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

function clamp(value, lo, hi, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function mountSettings({ onSearchChange = () => {}, onLogout = () => {} } = {}) {
  const dialog = $('settings');

  fillOptions($('sound-select'), SOUNDS.map(s => [s.id, s.name]));
  fillOptions($('engine-select'), ENGINES.map(e => [e.id, e.name]));

  $('settings-open').addEventListener('click', () => { paint(); dialog.showModal(); });

  // ---------- Timer ----------
  bindNumber('dur-pomodoro', 1, 180, v => { state.durations.pomodoro = v; syncToDurations(); });
  bindNumber('dur-short',    1, 60,  v => { state.durations.short = v; syncToDurations(); });
  bindNumber('dur-long',     1, 60,  v => { state.durations.long = v; syncToDurations(); });
  bindNumber('dur-interval', 2, 12,  v => { state.durations.interval = v; });

  $('sound-select').addEventListener('change', (e) => { state.sound = e.target.value; commit(); });
  $('sound-preview').addEventListener('click', () => playSound($('sound-select').value));

  // ---------- Day ----------
  bindNumber('ribbon-start', 0, 23, v => { state.ribbon.startHour = v; });
  bindNumber('ribbon-end',   1, 24, v => { state.ribbon.endHour = v; });
  $('ground-mode').addEventListener('change', (e) => {
    state.ground.mode = e.target.value;
    applyTheme();
    commit();
  });

  // ---------- Search ----------
  $('engine-select').addEventListener('change', (e) => {
    state.search.engine = e.target.value;
    commit();
    onSearchChange();
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

    $('ribbon-start').value = state.ribbon.startHour;
    $('ribbon-end').value = state.ribbon.endHour;
    $('ground-mode').value = state.ground.mode || 'auto';

    $('engine-select').value = state.search.engine || 'duckduckgo';
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
