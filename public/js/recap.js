// Quiet look at the day. Driven by the session log we already keep, plus the
// done-today counter. Lives behind the session-count in the right dock.

import { state, subscribe } from './store.js';

export function mountRecap(root) {
  const paint = () => { root.replaceChildren(renderRecap()); };
  paint();
  subscribe(paint);
}

function renderRecap() {
  const wrap = document.createElement('div');
  wrap.className = 'recap';

  const stats = recapStats();
  const done = Number(state.doneToday) || 0;
  const intention = (state.intention || '').trim();

  const lead = document.createElement('p');
  lead.className = 'recap-lead';
  lead.textContent = stats.todayCount === 0
    ? 'No sessions yet'
    : stats.todayCount === 1 ? '1 session' : `${stats.todayCount} sessions`;
  wrap.append(lead);

  if (stats.todayMinutes > 0) {
    const time = document.createElement('p');
    time.className = 'recap-time';
    time.textContent = formatFocus(stats.todayMinutes);
    wrap.append(time);
  }

  const tasks = document.createElement('p');
  tasks.className = 'recap-meta';
  tasks.textContent = done === 0
    ? 'No tasks done yet'
    : done === 1 ? '1 task done' : `${done} tasks done`;
  wrap.append(tasks);

  if (stats.weekCount > 0) {
    const line = document.createElement('p');
    line.className = 'recap-stats';
    line.textContent = statsLine(stats);
    wrap.append(line);
  }

  if (intention) {
    const line = document.createElement('p');
    line.className = 'recap-intention';
    line.textContent = intention;
    wrap.append(line);
  }

  wrap.append(renderWeek());

  const foot = document.createElement('div');
  foot.className = 'recap-foot';
  const hint = document.createElement('p');
  hint.className = 'recap-hint';
  hint.textContent = '? for shortcuts';
  foot.append(hint);
  if ((state.sessions || []).length > 0) {
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'recap-export';
    out.textContent = 'Export sessions';
    out.addEventListener('click', exportSessions);
    foot.append(out);
  }
  wrap.append(foot);

  return wrap;
}

/** Week aggregates over the last 7 calendar days. Pure for tests. */
export function recapStats(sessions = state.sessions || [], now = Date.now()) {
  const DAY = 86_400_000;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const todayStart = midnight.getTime();

  const days = new Map();
  for (const s of sessions) {
    if (!s || typeof s.t !== 'number') continue;
    const d = new Date(s.t);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (key > todayStart || todayStart - key > 6 * DAY) continue;
    const e = days.get(key) || { n: 0, mins: 0 };
    e.n += 1;
    e.mins += Number(s.minutes) || 0;
    days.set(key, e);
  }

  const today = days.get(todayStart) || { n: 0, mins: 0 };
  let weekCount = 0;
  let weekMinutes = 0;
  let best = null;
  for (const [key, e] of days) {
    weekCount += e.n;
    weekMinutes += e.mins;
    if (!best || e.mins > best.minutes || (e.mins === best.minutes && e.n > best.count)) {
      best = { key, count: e.n, minutes: e.mins };
    }
  }

  // A quiet today doesn't break the run — count back from yesterday instead.
  let streak = 0;
  let cursor = today.n ? todayStart : todayStart - DAY;
  while (days.has(cursor)) { streak += 1; cursor -= DAY; }

  return {
    todayCount: today.n,
    todayMinutes: today.mins,
    weekCount,
    weekMinutes,
    streak,
    best: best
      ? { ...best, label: new Date(best.key).toLocaleDateString([], { weekday: 'short' }) }
      : null,
  };
}

function statsLine(stats) {
  const bits = [`${formatFocus(stats.weekMinutes)} this week`];
  bits.push(stats.streak >= 2 ? `${stats.streak}-day streak` : stats.streak === 1 ? '1-day streak' : 'no streak yet');
  if (stats.best) {
    const b = stats.best;
    bits.push(`best ${b.label} ${b.count === 1 ? '1 session' : `${b.count} sessions`}`);
  }
  return bits.join(' · ');
}

function exportSessions() {
  const list = [...(state.sessions || [])]
    .filter(s => s && typeof s.t === 'number')
    .sort((a, b) => a.t - b.t);
  const rows = ['date,minutes'];
  for (const s of list) rows.push(`${new Date(s.t).toISOString()},${Number(s.minutes) || 0}`);
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'focus-sessions.csv';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
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
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const to = nextDay.getTime();
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
