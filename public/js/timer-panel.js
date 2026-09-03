// The timer, as the page's centrepiece: mode pills, a dot per pomodoro in the
// current long-break cycle, the readout, and the controls.

import { state, subscribe } from './store.js';
import { timer, onTick, onComplete, start, pause, reset, setMode, formatClock } from './pomodoro.js';
import { celebrate } from './celebrate.js';

const MODES = [
  ['pomodoro', 'Focus'],
  ['short', 'Short Break'],
  ['long', 'Long Break'],
];

/** Restart a CSS animation that may already be running. */
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;          // force reflow so the animation re-triggers
  el.classList.add(className);
}

export function mountTimer(root) {
  root.innerHTML = `
    <div class="modes" role="group" aria-label="Timer mode">
      ${MODES.map(([id, name]) =>
        `<button type="button" class="mode" data-mode="${id}">${name}</button>`).join('')}
    </div>
    <div class="dots" aria-hidden="true"></div>
    <p class="readout" role="timer" aria-live="off">
      <span class="digits"></span><span class="colon">:</span><span class="digits-2"></span>
    </p>
    <div class="controls">
      <button type="button" class="btn btn--primary timer-start"></button>
      <button type="button" class="icon-btn timer-reset" title="Reset" aria-label="Reset">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-6.4L3 8"/></svg>
      </button>
    </div>`;

  const readout = root.querySelector('.readout');
  const mins = root.querySelector('.digits');
  const secs = root.querySelector('.digits-2');
  const startBtn = root.querySelector('.timer-start');
  const resetBtn = root.querySelector('.timer-reset');
  const dots = root.querySelector('.dots');
  const modeButtons = [...root.querySelectorAll('.mode')];

  let wasRunning = timer.running;
  let lastDoneCount = -1;

  startBtn.addEventListener('click', () => {
    start();
    // Only celebrate setting off, not pausing.
    if (timer.running) replay(readout, 'is-kick');
  });

  resetBtn.addEventListener('click', () => {
    reset();
    replay(resetBtn, 'is-spin');
  });

  modeButtons.forEach(b => b.addEventListener('click', () => {
    if (timer.running) pause();
    setMode(b.dataset.mode);
    replay(readout, 'is-swap');
  }));

  const paintDots = () => {
    const interval = Math.max(2, Number(state.durations.interval) || 4);
    const done = (state.completedPomodoros || 0) % interval;
    const grew = lastDoneCount >= 0 && done > lastDoneCount;

    dots.innerHTML = '';
    for (let i = 0; i < interval; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot' + (i < done ? ' is-done' : '');
      // Pop only the dot that just filled.
      if (grew && i === done - 1) dot.classList.add('is-new');
      dots.append(dot);
    }
    lastDoneCount = done;
  };

  const paint = () => {
    const [m, s] = formatClock(timer.remaining).split(':');
    mins.textContent = m;
    secs.textContent = s;
    readout.classList.toggle('is-running', timer.running);

    startBtn.textContent = timer.running
      ? 'Pause'
      : (timer.remaining < timer.total ? 'Resume' : 'Start');

    modeButtons.forEach(b => {
      const on = b.dataset.mode === timer.mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });

    wasRunning = timer.running;
  };

  onComplete((mode) => {
    replay(readout, 'is-finished');
    if (mode === 'pomodoro') celebrate(readout);
  });

  paint();
  paintDots();
  onTick(paint);
  subscribe(() => { paint(); paintDots(); });
}
