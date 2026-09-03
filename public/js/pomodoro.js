// The focus timer. Runtime fields (mode, remaining, running) are per-device and
// deliberately not synced — only durations, the completed count, and the session
// log round-trip to the server.

import { state, commit, render } from './store.js';

export const timer = {
  mode: 'pomodoro',   // pomodoro | short | long
  remaining: 0,
  total: 0,
  running: false,
};

let endTime = 0;
let handle = null;

const tickListeners = new Set();
/** Subscribe to the 4Hz tick. Used for text-only updates that must not trigger
 *  a full re-render (the timer readout and the ribbon's meta line). */
export function onTick(fn) { tickListeners.add(fn); return () => tickListeners.delete(fn); }
function emitTick() { for (const fn of tickListeners) { try { fn(); } catch (e) { console.error(e); } } }

export function durationFor(mode) {
  const d = state.durations || {};
  const mins = mode === 'pomodoro' ? d.pomodoro : mode === 'short' ? d.short : d.long;
  return Math.max(1, Number(mins) || 25) * 60;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function stopTicking() {
  timer.running = false;
  clearInterval(handle);
  handle = null;
  restoreTitle();
}

export function setMode(mode, { resetTime = true } = {}) {
  timer.mode = mode;
  if (resetTime) {
    timer.total = durationFor(mode);
    timer.remaining = timer.total;
  }
  emitTick();
}

export function start() {
  if (timer.running) return pause();
  if (timer.remaining <= 0) reset();
  timer.running = true;
  endTime = Date.now() + timer.remaining * 1000;
  handle = setInterval(tick, 250);
  tick();
  emitTick();
}

export function pause() {
  stopTicking();
  emitTick();
}

export function reset() {
  stopTicking();
  timer.total = durationFor(timer.mode);
  timer.remaining = timer.total;
  emitTick();
}

/** Called when durations change in settings — keeps an idle timer in step. */
export function syncToDurations() {
  if (!timer.running) reset();
}

function tick() {
  timer.remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  updateTitle();
  emitTick();
  if (timer.remaining <= 0) complete();
}

function complete() {
  const finished = timer.mode;
  stopTicking();
  playSound();

  if (finished === 'pomodoro') {
    state.completedPomodoros = (state.completedPomodoros || 0) + 1;
    state.sessions.push({ t: Date.now(), minutes: Math.round(timer.total / 60) });

    if (state.currentTaskId) {
      const task = state.tasks.find(t => t.id === state.currentTaskId);
      if (task) task.done = true;
      state.currentTaskId = nextTaskId();
    }

    const interval = Math.max(2, Number(state.durations.interval) || 4);
    setMode(state.completedPomodoros % interval === 0 ? 'long' : 'short');
    commit();
  } else {
    setMode('pomodoro');
    render();
  }
}

export function nextTaskId() {
  const next = state.tasks.find(t => !t.done);
  return next ? next.id : null;
}

/** Sessions completed since local midnight. */
export function sessionsToday() {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return (state.sessions || []).filter(s => s.t >= midnight.getTime());
}

// ---------- Tab title ----------
const BASE_TITLE = 'Homepage';
function updateTitle() {
  document.title = timer.running
    ? `${formatClock(timer.remaining)} · ${timer.mode === 'pomodoro' ? 'focus' : 'break'}`
    : BASE_TITLE;
}
function restoreTitle() { document.title = BASE_TITLE; }

// ---------- Sound ----------
export const SOUNDS = [
  { id: 'chime',   name: 'Chime' },
  { id: 'bell',    name: 'Temple bell' },
  { id: 'marimba', name: 'Marimba' },
  { id: 'digital', name: 'Digital beep' },
  { id: 'soft',    name: 'Soft tone' },
  { id: 'none',    name: 'None' },
];

let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(c, { freq, type = 'sine', start, dur, gain = 0.2, glideTo }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

const SYNTHS = {
  chime(c, t) {
    [880, 660, 880].forEach((f, i) => tone(c, { freq: f, start: t + i * 0.18, dur: 0.16, gain: 0.18 }));
  },
  bell(c, t) {
    tone(c, { freq: 392,  type: 'triangle', start: t, dur: 1.4, gain: 0.22 });
    tone(c, { freq: 784,  start: t, dur: 1.2, gain: 0.10 });
    tone(c, { freq: 1176, start: t, dur: 0.9, gain: 0.05 });
  },
  marimba(c, t) {
    [523, 659].forEach((f, i) => tone(c, { freq: f, start: t + i * 0.12, dur: 0.18, gain: 0.20 }));
  },
  digital(c, t) {
    [880, 880, 1320].forEach((f, i) => tone(c, { freq: f, type: 'square', start: t + i * 0.13, dur: 0.08, gain: 0.12 }));
  },
  soft(c, t) {
    tone(c, { freq: 523, start: t, dur: 0.6, gain: 0.18, glideTo: 392 });
  },
  none() {},
};

export function playSound(id = state.sound) {
  try {
    const c = ctx();
    if (!c) return;
    (SYNTHS[id] || SYNTHS.chime)(c, c.currentTime);
  } catch {}
}

// ---------- Panel ----------
const MODE_LABELS = { pomodoro: 'Focus', short: 'Short break', long: 'Long break' };

export function mountTimer(root) {
  root.innerHTML = `
    <div class="timer">
      <div class="timer-modes" role="group" aria-label="Timer mode">
        ${Object.entries(MODE_LABELS).map(([id, name]) =>
          `<button type="button" class="timer-mode" data-mode="${id}">${name}</button>`).join('')}
      </div>
      <p class="timer-readout"><span class="timer-value"></span></p>
      <div class="timer-progress"><span></span></div>
      <div class="timer-controls">
        <button type="button" class="btn btn--primary timer-start"></button>
        <button type="button" class="btn timer-reset">Reset</button>
      </div>
    </div>`;

  const value = root.querySelector('.timer-value');
  const progress = root.querySelector('.timer-progress span');
  const startBtn = root.querySelector('.timer-start');
  const modes = [...root.querySelectorAll('.timer-mode')];

  startBtn.addEventListener('click', start);
  root.querySelector('.timer-reset').addEventListener('click', reset);
  modes.forEach(b => b.addEventListener('click', () => {
    if (timer.running) pause();
    setMode(b.dataset.mode);
  }));

  const paint = () => {
    value.textContent = formatClock(timer.remaining);
    progress.style.width = timer.total ? `${(1 - timer.remaining / timer.total) * 100}%` : '0%';
    startBtn.textContent = timer.running ? 'Pause' : (timer.remaining < timer.total ? 'Resume' : 'Start');
    root.querySelector('.timer').dataset.mode = timer.mode;
    root.querySelector('.timer').classList.toggle('is-running', timer.running);
    modes.forEach(b => {
      const on = b.dataset.mode === timer.mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };

  paint();
  onTick(paint);
  return paint;
}
