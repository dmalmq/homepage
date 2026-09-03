// The colour field tracks the real hour, so the background carries information
// instead of just decorating. `ground.mode` can pin it to a single phase.

import { state } from './store.js';

export const PHASES = ['dawn', 'day', 'dusk', 'night'];

const BANDS = [
  { id: 'night', from: 0,  to: 5  },
  { id: 'dawn',  from: 5,  to: 9  },
  { id: 'day',   from: 9,  to: 16 },
  { id: 'dusk',  from: 16, to: 20 },
  { id: 'night', from: 20, to: 24 },
];

export function phaseForHour(hour) {
  const band = BANDS.find(b => hour >= b.from && hour < b.to);
  return band ? band.id : 'night';
}

export function applyTheme(now = new Date()) {
  const mode = (state.ground && state.ground.mode) || 'auto';
  const phase = PHASES.includes(mode) ? mode : phaseForHour(now.getHours());
  document.documentElement.dataset.phase = phase;
}

export function startThemeClock() {
  applyTheme();
  // Re-check every minute. The phase only turns over on an hour boundary, but
  // this keeps it right across sleep/wake without extra listeners.
  setInterval(() => applyTheme(), 60_000);
}
