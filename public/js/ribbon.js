// The day ribbon — the page's one bold element.
//
// Shows today from ribbon.startHour to ribbon.endHour as a single band: elapsed
// time behind you, completed focus sessions as solid blocks, and a marker for
// now. It replaces both a big clock and a separate "sessions completed" counter,
// because on a start page those are the same question: where am I in the day?

import { state, subscribe } from './store.js';
import { timer, onTick, sessionsToday, formatClock } from './pomodoro.js';

const HOUR_MS = 3_600_000;

let els = null;

function midnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function bounds() {
  const start = Math.max(0, Math.min(23, Number(state.ribbon?.startHour) ?? 6));
  const end = Math.max(start + 1, Math.min(24, Number(state.ribbon?.endHour) ?? 22));
  const base = midnight();
  return { startMs: base + start * HOUR_MS, endMs: base + end * HOUR_MS, start, end };
}

function pctFor(ms, { startMs, endMs }) {
  return ((ms - startMs) / (endMs - startMs)) * 100;
}

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function mountRibbon(root) {
  root.innerHTML = `
    <div class="ribbon">
      <div class="ribbon-hours" aria-hidden="true"></div>
      <div class="ribbon-track">
        <div class="ribbon-elapsed"></div>
        <div class="ribbon-sessions"></div>
        <div class="ribbon-now"><span class="ribbon-now-time"></span></div>
      </div>
      <p class="ribbon-meta">
        <span class="ribbon-task"></span>
        <span class="ribbon-timer"></span>
        <span class="ribbon-count"></span>
      </p>
    </div>`;

  els = {
    hours:    root.querySelector('.ribbon-hours'),
    elapsed:  root.querySelector('.ribbon-elapsed'),
    sessions: root.querySelector('.ribbon-sessions'),
    now:      root.querySelector('.ribbon-now'),
    nowTime:  root.querySelector('.ribbon-now-time'),
    task:     root.querySelector('.ribbon-task'),
    timer:    root.querySelector('.ribbon-timer'),
    count:    root.querySelector('.ribbon-count'),
  };

  renderRibbon();
  subscribe(renderRibbon);
  onTick(renderMeta);

  // The marker advances on a calm 30s cadence rather than every tick — it moves
  // because time moved, which is the only motion here that isn't user-triggered.
  setInterval(() => { renderPosition(); renderMeta(); }, 30_000);
}

function renderRibbon() {
  if (!els) return;
  const b = bounds();

  els.hours.innerHTML = '';
  for (let h = b.start; h <= b.end; h += 3) {
    const tick = document.createElement('span');
    tick.className = 'ribbon-hour';
    tick.style.left = `${clamp(pctFor(midnight() + h * HOUR_MS, b))}%`;
    tick.textContent = String(h % 24).padStart(2, '0');
    els.hours.append(tick);
  }

  els.sessions.innerHTML = '';
  for (const s of sessionsToday()) {
    const endedAt = s.t;
    const startedAt = endedAt - (Number(s.minutes) || 25) * 60_000;
    const left = clamp(pctFor(startedAt, b));
    const right = clamp(pctFor(endedAt, b));
    if (right <= 0 || left >= 100) continue;
    const block = document.createElement('span');
    block.className = 'ribbon-session';
    block.style.left = `${left}%`;
    block.style.width = `${Math.max(0.6, right - left)}%`;
    els.sessions.append(block);
  }

  renderPosition();
  renderMeta();
}

function renderPosition() {
  if (!els) return;
  const b = bounds();
  const raw = pctFor(Date.now(), b);
  const pct = clamp(raw);
  els.elapsed.style.width = `${pct}%`;
  els.now.style.left = `${pct}%`;
  els.now.classList.toggle('is-off-range', raw < 0 || raw > 100);
  els.nowTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function renderMeta() {
  if (!els) return;

  const task = state.tasks.find(t => t.id === state.currentTaskId);
  els.task.textContent = task ? task.text : 'No task selected';
  els.task.classList.toggle('is-empty', !task);

  // Only worth a number while it's counting — the idle time is already spelled
  // out in the Focus panel right below.
  els.timer.textContent = timer.running ? `${formatClock(timer.remaining)} left` : 'not running';
  els.timer.classList.toggle('is-running', timer.running);

  const n = sessionsToday().length;
  els.count.textContent = n === 0 ? 'nothing finished yet' : `${n} done today`;
}

// ---------- Date line ----------
export function mountDate(el) {
  const paint = () => {
    el.textContent = new Date().toLocaleDateString([], {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  };
  paint();
  setInterval(paint, 60_000);
}
