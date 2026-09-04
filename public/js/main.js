// Boot: gate on the session cookie, then mount everything once and let the
// store drive re-renders from there.

import { api } from './api.js';
import {
  state, initializeState, initializeCachedState, render, commit, pullState, subscribe,
  subscribeSync, syncStatus, retrySyncNow, setUnauthedHandler, ensureDay,
} from './store.js';
import { startThemeClock, applyTheme } from './theme.js';
import { mountTimer } from './timer-panel.js';
import { sessionsToday, timer, reset as resetTimer, reconcileTimer, startCustom, onComplete } from './pomodoro.js';
import { mountTasks, addTask } from './tasks.js';
import { mountNotes } from './notes.js';
import { mountFavorites } from './favorites.js';
import { mountStations, hidePlayer, pause as pauseMusic } from './stations.js';
import { mountWeather } from './weather.js';
import { mountSearch } from './search.js';
import { mountSettings } from './settings.js';
import { mountIntention } from './intention.js';
import { mountRecap } from './recap.js';
import { wireKeys } from './keys.js';
import { mountStage, setStage } from './stage.js';
import { mountTopbarClock } from './clock.js';
import { mountWallpaper } from './wallpaper.js';

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
// showPanel toggles, which is what the dock buttons want. Commands want
// open-without-toggle: adding a second task must not close the queue.
function ensurePanel(name) {
  if (openPanel !== name) showPanel(name);
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
    if ($('keys') && $('keys').open) return;

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

function wireCurrentTask() {
  const el = $('current-task');
  // Clicking it opens the queue, which is the only place to change it now.
  el.addEventListener('click', () => showPanel('tasks'));

  const paint = () => {
    const task = state.tasks.find(t => t.id === state.currentTaskId);
    if (!task) {
      el.textContent = 'No task selected';
      el.classList.add('is-empty');
      // The line truncates, so the title has to carry the text rather than a
      // hint about clicking; the hover treatment already says it is a control.
      el.title = 'Pick something to work on';
    } else if (Number(task.est)) {
      const spent = Math.min(Number(task.spent) || 0, Number(task.est));
      el.textContent = `${task.text} · ${spent}/${task.est}`;
      el.title = `${task.text} — ${spent} of ${task.est} sessions banked`;
      el.classList.remove('is-empty');
    } else {
      el.textContent = task.text;
      el.classList.remove('is-empty');
      el.title = task.text;
    }
    // One voice above the timer: when both the day line and a task are set,
    // tighten the stack and quiet the intention down to a whisper.
    const copy = el.closest('.stage-copy');
    if (copy) copy.classList.toggle('is-combined', !!task && !!(state.intention || '').trim());
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

function wireSyncStatus() {
  const el = $('sync-status');
  const labels = {
    idle: '', saving: 'Saving', synced: '', offline: 'Offline', error: 'Sync failed',
  };
  const paint = () => {
    const backup = syncStatus.backupAvailable ? '' : ' · local backup unavailable';
    el.textContent = labels[syncStatus.phase] || '';
    el.hidden = !el.textContent && !backup;
    el.className = `sync-status sync-status--${syncStatus.phase}`;
    el.title = `${el.textContent || 'Synced'}${backup}`;
    el.setAttribute('aria-label', el.title);
  };
  paint();
  subscribeSync(paint);
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

// Local search commands: `t`/`tl` add tasks, `n` appends a note, `timer 25`
// starts a session, and a bare calculation answers inline. All run without a
// network request; anything else falls through to the web search.
function handleSearchCommand(cmd, input) {
  if (cmd.kind === 'task') {
    addTask(cmd.text, cmd.list);
    ensurePanel('tasks');
    return undefined;
  }
  if (cmd.kind === 'note') {
    state.notes = state.notes ? state.notes.replace(/\s+$/, '') + '\n' + cmd.text : cmd.text;
    commit();
    ensurePanel('notes');
    return undefined;
  }
  if (cmd.kind === 'timer') {
    startCustom(cmd.mode, cmd.minutes);
    setStage('pomodoro');
    return undefined;
  }
  if (cmd.kind === 'calc') {
    input.value = `${cmd.expr} = ${cmd.value}`;
    input.select();
    return 'keep';
  }
  return undefined;
}

function mountAll() {
  mountDate($('date'));
  mountTopbarClock($('topbar-clock'));
  mountStage();
  mountIntention($('intention'));
  mountTimer($('timer-root'));
  // The chime gets the room: controlled players pause in place, raw embeds
  // stop (no pause handle). Per-tab like the timer, so other tabs keep
  // theirs. Runs in the same task as the chime trigger: no overlap.
  onComplete(() => pauseMusic());
  searchApi = mountSearch($('search-root'), { onLocal: handleSearchCommand });
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
  wireSyncStatus();
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
    onLogout: async () => { await api.logout(); showLogin(); },
  });
  startThemeClock();
}

function enterApp(remoteState) {
  initializeState(remoteState || {});
  applyTheme();
  // Seed the readout from the durations we just loaded. Guarded so a sync pull
  // can never yank a running timer back to the top.
  if (!timer.running) resetTimer();

  loginEl.hidden = true;
  appEl.hidden = false;

  if (!mounted) { mountAll(); mounted = true; }
  else { render(); }

  if (searchApi) searchApi.focus();
}

setUnauthedHandler(showLogin);

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const password = pwEl.value;
  pwEl.value = '';
  if (!password) return;

  const submit = e.currentTarget.querySelector('[type="submit"]');
  submit.disabled = true;
  let res;
  try {
    res = await api.login(password);
  } catch {
    errEl.textContent = 'Could not reach the server. Check your connection and try again.';
    submit.disabled = false;
    return;
  }
  submit.disabled = false;
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
    reconcileTimer();
    ensureDay();
    pullState();
  }
});
window.addEventListener('focus', () => {
  reconcileTimer();
  if (loginEl.hidden && Date.now() - lastFocus > 5000) pullState();
  lastFocus = Date.now();
});
window.addEventListener('online', retrySyncNow);
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
    if (initializeCachedState()) {
      applyTheme();
      if (!timer.running) resetTimer();
      loginEl.hidden = true;
      appEl.hidden = false;
      if (!mounted) { mountAll(); mounted = true; }
      else render();
      if (searchApi) searchApi.focus();
    } else {
      showLogin();
    }
  }
})();
