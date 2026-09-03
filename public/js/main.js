// Boot: gate on the session cookie, then mount every panel once and let the
// store drive re-renders from there.

import { api } from './api.js';
import { replaceState, render, pullState, setUnauthedHandler } from './store.js';
import { startThemeClock, applyTheme } from './theme.js';
import { mountRibbon, mountDate } from './ribbon.js';
import { mountTimer, setMode } from './pomodoro.js';
import { mountTasks } from './tasks.js';
import { mountNotes } from './notes.js';
import { mountFavorites } from './favorites.js';
import { mountStations } from './stations.js';
import { mountWeather } from './weather.js';
import { mountSearch } from './search.js';
import { mountSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

const loginEl = $('login');
const appEl = $('app');
const pwEl = $('login-pw');
const errEl = $('login-err');

let mounted = false;
let searchApi = null;

function showLogin() {
  appEl.hidden = true;
  loginEl.hidden = false;
  errEl.textContent = '';
  setTimeout(() => pwEl.focus(), 0);
}

function mountAll() {
  mountDate($('date'));
  mountRibbon($('ribbon-root'));
  searchApi = mountSearch($('search-root'));
  mountTimer($('timer-root'));
  mountTasks($('tasks-root'));
  mountFavorites($('favorites-root'));
  mountStations($('stations-root'), $('player'));
  mountNotes($('notes-root'));
  mountWeather($('weather'));
  mountSettings({
    onSearchChange: () => searchApi && searchApi.paint(),
    onLogout: async () => { await api.logout(); showLogin(); },
  });
  startThemeClock();
}

function enterApp(remoteState) {
  replaceState(remoteState || {});
  applyTheme();
  setMode('pomodoro');

  loginEl.hidden = true;
  appEl.hidden = false;

  if (!mounted) { mountAll(); mounted = true; }
  else render();

  if (searchApi) searchApi.focus();
}

setUnauthedHandler(showLogin);

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const password = pwEl.value;
  pwEl.value = '';
  if (!password) return;

  const res = await api.login(password);
  if (!res.ok) {
    errEl.textContent =
      res.status === 401 || res.error === 'invalid'
        ? 'Wrong password.'
      : res.status === 500 || res.error === 'server-config'
        ? 'The server is missing APP_PASSWORD or APP_SECRET. Set both and redeploy.'
      : res.status === 405
        ? 'The login endpoint is not reachable. Check the deployment.'
      : `Login failed (HTTP ${res.status}).`;
    return;
  }

  try {
    const next = await api.getState();
    if (!next.authed) {
      errEl.textContent = 'The session did not stick. Check that APP_SECRET is set.';
      return;
    }
    enterApp(next.state);
  } catch {
    errEl.textContent = 'Signed in, but the database is unreachable. Check /api/health.';
  }
});

// ---------- Keyboard ----------
// The search field takes focus on load, so single-letter shortcuts would be
// swallowed by it. Only these two, which coexist with a live text field.
document.addEventListener('keydown', (e) => {
  if (!loginEl.hidden) return;
  const input = document.querySelector('.search-input');
  if (!input) return;
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  } else if (e.key === 'Escape' && document.activeElement === input) {
    input.blur();
  }
});

// ---------- Cross-device sync ----------
let lastFocus = Date.now();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && loginEl.hidden) pullState();
});
window.addEventListener('focus', () => {
  if (loginEl.hidden && Date.now() - lastFocus > 5000) pullState();
  lastFocus = Date.now();
});
setInterval(() => { if (loginEl.hidden) pullState(); }, 60_000);

// ---------- Init ----------
(async function boot() {
  try {
    const res = await api.getState();
    if (!res.authed) return showLogin();
    enterApp(res.state);
  } catch {
    showLogin();
  }
})();
