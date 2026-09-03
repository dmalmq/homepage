// Boot: gate on the session cookie, then mount everything once and let the
// store drive re-renders from there.

import { api } from './api.js';
import { state, replaceState, render, pullState, subscribe, setUnauthedHandler, ensureDay } from './store.js';
import { startThemeClock, applyTheme } from './theme.js';
import { mountTimer } from './timer-panel.js';
import { sessionsToday, timer, reset as resetTimer } from './pomodoro.js';
import { mountTasks } from './tasks.js';
import { mountNotes } from './notes.js';
import { mountFavorites } from './favorites.js';
import { mountStations, hidePlayer } from './stations.js';
import { mountWeather } from './weather.js';
import { mountSearch } from './search.js';
import { mountQuote } from './quote.js';
import { mountSettings } from './settings.js';
import { mountIntention } from './intention.js';
import { mountRecap } from './recap.js';
import { wireKeys } from './keys.js';
import { mountStage, setStage } from './stage.js';
import { mountClock } from './clock.js';
import { mountWallpaper } from './wallpaper.js';

const $ = (id) => document.getElementById(id);

const loginEl = $('login');
const appEl = $('app');
const pwEl = $('login-pw');
const errEl = $('login-err');

let mounted = false;
let searchApi = null;
let quoteApi = null;

function showLogin() {
  appEl.hidden = true;
  loginEl.hidden = false;
  errEl.textContent = '';
  setTimeout(() => pwEl.focus(), 0);
}

// ---------- Dock + floating panel ----------
const PANEL_TITLES = { tasks: 'Tasks', listen: 'Listen', notes: 'Notes', recap: 'Today' };
let openPanel = null;

function showPanel(name) {
  const panel = $('panel');
  if (openPanel === name) return hidePanel();

  openPanel = name;
  $('panel-title').textContent = PANEL_TITLES[name] || '';
  for (const key of Object.keys(PANEL_TITLES)) {
    $(`panel-${key}`).hidden = key !== name;
  }
  panel.classList.toggle('panel--right', name === 'recap');
  panel.hidden = false;
  document.querySelectorAll('.dock-btn[data-panel]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.panel === name);
  });
  $('session-count').classList.toggle('is-active', name === 'recap');

  // Autofocus the field a panel exists for, so it's usable straight away.
  const field = name === 'notes'
    ? panel.querySelector('.notes-area')
    : name === 'tasks' ? panel.querySelector('[data-list="today"].task-input') : null;
  if (field) setTimeout(() => field.focus(), 0);
}

function hidePanel() {
  openPanel = null;
  const panel = $('panel');
  panel.hidden = true;
  panel.classList.remove('panel--right');
  document.querySelectorAll('.dock-btn[data-panel]').forEach(b => b.classList.remove('is-active'));
  $('session-count').classList.remove('is-active');
}

function wireDock() {
  document.querySelectorAll('.dock-btn[data-panel]').forEach(b => {
    b.addEventListener('click', () => showPanel(b.dataset.panel));
  });
  $('panel-close').addEventListener('click', hidePanel);
  $('session-count').addEventListener('click', () => showPanel('recap'));

  $('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });

  wireDismiss();
}

function wireDismiss() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (document.querySelector('.settings[open]')) return;
    if ($('keys') && !$('keys').hidden) return;

    if (openPanel) {
      const inPanel = $('panel').contains(t);
      const opensPanel = t.closest('.dock-btn[data-panel], #session-count, #current-task');
      if (!inPanel && !opensPanel) hidePanel();
    }

    const player = $('player');
    if (player && !player.hidden && !player.classList.contains('is-tucked')) {
      if (!player.contains(t) && !t.closest('.station')) hidePlayer();
    }
  });
}

// ---------- Current task line ----------
function wireCurrentTask() {
  const el = $('current-task');
  // Clicking it opens the queue, which is the only place to change it now.
  el.addEventListener('click', () => showPanel('tasks'));

  const paint = () => {
    const task = state.tasks.find(t => t.id === state.currentTaskId);
    el.textContent = task ? task.text : 'No task selected';
    el.classList.toggle('is-empty', !task);
    el.title = task ? 'Open the queue' : 'Pick something to work on';
  };
  paint();
  subscribe(paint);
}

function wireSessionCount() {
  const el = $('session-count');
  const paint = () => {
    const n = sessionsToday().length;
    el.textContent = n === 1 ? '1 session' : `${n} sessions`;
  };
  paint();
  subscribe(paint);
  setInterval(paint, 60_000);
}

// ---------- Date ----------
function mountDate(el) {
  const paint = () => {
    el.textContent = new Date().toLocaleDateString([], {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  };
  paint();
  setInterval(paint, 60_000);
}

function mountAll() {
  mountDate($('date'));
  quoteApi = mountQuote($('quote'));
  mountStage();
  mountClock($('clock-root'));
  mountIntention($('intention'));
  mountTimer($('timer-root'));
  searchApi = mountSearch($('search-root'));
  mountFavorites($('favorites-root'));
  mountTasks($('panel-tasks'));
  mountNotes($('panel-notes'));
  mountRecap($('panel-recap'));
  mountStations($('stations-root'), $('player'));
  mountWeather($('weather'));
  mountWallpaper($('wallpaper'));
  wireDock();
  wireCurrentTask();
  wireSessionCount();
  wireKeys({
    isApp: () => loginEl.hidden,
    isBlocked: () => !!document.querySelector('.settings[open]'),
    showPanel,
    hidePanel,
    getOpenPanel: () => openPanel,
    focusSearch: () => { setStage('start'); searchApi && searchApi.focus(); },
    blurSearch: () => searchApi && searchApi.blur(),
  });
  mountSettings({
    onSearchChange: () => searchApi && searchApi.paint(),
    onQuoteChange: () => quoteApi && quoteApi(),
    onLogout: async () => { await api.logout(); showLogin(); },
  });
  startThemeClock();
}

function enterApp(remoteState) {
  replaceState(remoteState || {});
  applyTheme();
  // Seed the readout from the durations we just loaded. Guarded so a sync pull
  // can never yank a running timer back to the top.
  if (!timer.running) resetTimer();

  loginEl.hidden = true;
  appEl.hidden = false;

  if (!mounted) { mountAll(); mounted = true; }
  else { render(); if (quoteApi) quoteApi(); }

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
      res.status === 429 || res.error === 'too-many'
        ? `Too many attempts. Try again in ${Math.ceil((res.retryAfterSec || 900) / 60)} minutes.`
      : res.status === 401 || res.error === 'invalid'
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

// ---------- Cross-device sync ----------
let lastFocus = Date.now();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && loginEl.hidden) {
    ensureDay();
    pullState();
  }
});
window.addEventListener('focus', () => {
  if (loginEl.hidden && Date.now() - lastFocus > 5000) pullState();
  lastFocus = Date.now();
});
setInterval(() => {
  if (!loginEl.hidden) return;
  ensureDay();
  pullState();
}, 60_000);

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
