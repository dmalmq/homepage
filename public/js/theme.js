// The page ground tracks the real hour, so the background carries information
// instead of decorating. `ground.mode` can pin it to light or dark.

import { state } from './store.js';

const PHASES = [
  { id: 'night', from: 0,  to: 5  },
  { id: 'dawn',  from: 5,  to: 8  },
  { id: 'day',   from: 8,  to: 17 },
  { id: 'dusk',  from: 17, to: 20 },
  { id: 'night', from: 20, to: 24 },
];

export function phaseForHour(hour) {
  const found = PHASES.find(p => hour >= p.from && hour < p.to);
  return found ? found.id : 'night';
}

export function applyTheme(now = new Date()) {
  const mode = (state.ground && state.ground.mode) || 'auto';
  const phase = mode === 'light' ? 'day'
              : mode === 'dark'  ? 'night'
              : phaseForHour(now.getHours());
  document.documentElement.dataset.phase = phase;
}

export function startThemeClock() {
  applyTheme();
  // Re-check every minute; the phase only changes on an hour boundary but this
  // keeps it correct across sleep/wake without a visibilitychange listener.
  setInterval(() => applyTheme(), 60_000);
}
