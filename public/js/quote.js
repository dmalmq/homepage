// A line in the corner. Deliberately a fixed local list rather than an API:
// this page opens on every new tab and must not wait on anything.
//
// The choice is keyed to the date, so it's the same line all day rather than
// changing on every tab — a quote that flickers is a quote you start ignoring.

import { state } from './store.js';

const QUOTES = [
  'It always seems impossible until it’s done',
  'The way to get started is to quit talking and begin doing',
  'Simplicity is the soul of efficiency',
  'Well begun is half done',
  'Amateurs sit and wait for inspiration; the rest of us just get up and go to work',
  'What gets measured gets managed',
  'Slow is smooth, and smooth is fast',
  'Perfection is achieved when there is nothing left to take away',
  'You do not rise to the level of your goals, you fall to the level of your systems',
  'The obstacle is the way',
  'Done is better than perfect',
  'Focus is a matter of deciding what things you’re not going to do',
];

function quoteForToday() {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const day = Math.floor(midnight.getTime() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}

export function mountQuote(el) {
  const paint = () => {
    const show = state.showQuote !== false;
    el.hidden = !show;
    if (show) el.textContent = `“${quoteForToday()}”`;
  };
  paint();
  return paint;
}
