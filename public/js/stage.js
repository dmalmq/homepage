// The middle of the page is two views: Start (search, favorites, centred) and
// Pomodoro (intention, task, timer). A new tab always opens on Start — that's
// the reason the page is the default new-tab. The time lives in the topbar.

const TABS = ['start', 'pomodoro'];

let current = 'start';
const listeners = new Set();

export function getStage() { return current; }

export function onStage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setStage(name) {
  if (!TABS.includes(name) || name === current) return;
  current = name;
  paint();
  for (const fn of listeners) {
    try { fn(current); } catch (e) { console.error(e); }
  }
}

export function mountStage() {
  const tabs = [...document.querySelectorAll('.stage-tab')];
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => setStage(btn.dataset.stage));
  });
  const list = document.querySelector('.stage-tabs');
  if (list) {
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const i = TABS.indexOf(current);
      const next = e.key === 'ArrowRight'
        ? TABS[(i + 1) % TABS.length]
        : TABS[(i - 1 + TABS.length) % TABS.length];
      setStage(next);
      document.querySelector(`.stage-tab[data-stage="${next}"]`)?.focus();
    });
  }
  paint();
}

function paint() {
  const app = document.getElementById('app');
  if (app) app.dataset.stage = current;

  document.querySelectorAll('.stage-tab').forEach((btn) => {
    const on = btn.dataset.stage === current;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
  });

  const start = document.getElementById('stage-start');
  const pomo = document.getElementById('stage-pomodoro');
  if (start) start.hidden = current !== 'start';
  if (pomo) pomo.hidden = current !== 'pomodoro';
}
