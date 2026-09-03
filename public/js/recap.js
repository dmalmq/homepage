// Quiet look at the day. Driven by the session log we already keep, plus the
// done-today counter. Lives behind the session-count in the right dock.

import { state, subscribe } from './store.js';
import { sessionsToday } from './pomodoro.js';

export function mountRecap(root) {
  const paint = () => { root.replaceChildren(renderRecap()); };
  paint();
  subscribe(paint);
}

function renderRecap() {
  const wrap = document.createElement('div');
  wrap.className = 'recap';

  const today = sessionsToday();
  const minutes = today.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const done = Number(state.doneToday) || 0;
  const intention = (state.intention || '').trim();

  const lead = document.createElement('p');
  lead.className = 'recap-lead';
  lead.textContent = today.length === 0
    ? 'No sessions yet'
    : today.length === 1 ? '1 session' : `${today.length} sessions`;
  wrap.append(lead);

  if (minutes > 0) {
    const time = document.createElement('p');
    time.className = 'recap-time';
    time.textContent = formatFocus(minutes);
    wrap.append(time);
  }

  const tasks = document.createElement('p');
  tasks.className = 'recap-meta';
  tasks.textContent = done === 0
    ? 'No tasks done yet'
    : done === 1 ? '1 task done' : `${done} tasks done`;
  wrap.append(tasks);

  if (intention) {
    const line = document.createElement('p');
    line.className = 'recap-intention';
    line.textContent = intention;
    wrap.append(line);
  }

  wrap.append(renderWeek());

  const hint = document.createElement('p');
  hint.className = 'recap-hint';
  hint.textContent = '? for shortcuts';
  wrap.append(hint);

  return wrap;
}

function renderWeek() {
  const row = document.createElement('div');
  row.className = 'week';
  row.setAttribute('aria-label', 'Sessions this week');

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const day = new Date(start);
    day.setDate(day.getDate() - i);
    const from = day.getTime();
    const to = from + 86_400_000;
    const hits = (state.sessions || []).filter(s => s.t >= from && s.t < to);
    const mins = hits.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

    const col = document.createElement('div');
    col.className = 'week-day' + (i === 0 ? ' is-today' : '');
    const n = hits.length;
    col.title = n === 0
      ? dayLabel(day)
      : `${dayLabel(day)} · ${n === 1 ? '1 session' : n + ' sessions'} · ${formatFocus(mins)}`;

    const count = document.createElement('span');
    count.className = 'week-n';
    count.textContent = n ? String(n) : '';

    const dot = document.createElement('span');
    dot.className = 'dot' + (n ? ' is-done' : '');

    const label = document.createElement('span');
    label.className = 'week-label';
    label.textContent = day.toLocaleDateString([], { weekday: 'short' }).slice(0, 2);

    col.append(count, dot, label);
    row.append(col);
  }
  return row;
}

function dayLabel(d) {
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatFocus(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
