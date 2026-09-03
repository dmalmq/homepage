// A confetti burst for finishing a focus session.
//
// Hand-rolled rather than a library: it's ~30 divs and a keyframe, and this page
// must not grow a dependency it downloads on every new tab. Elements remove
// themselves when their animation ends, so nothing accumulates.

const COLOURS = ['#ffd166', '#ff5f95', '#5ce0c0', '#8a6bff', '#ffffff', '#35d6f5'];
const PIECES = 34;

export function celebrate(origin) {
  // Someone who has asked for less motion should not get confetti.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rect = origin
    ? origin.getBoundingClientRect()
    : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < PIECES; i++) {
    const piece = document.createElement('i');
    const angle = (Math.PI * 2 * i) / PIECES + (Math.random() - 0.5) * 0.4;
    const distance = 120 + Math.random() * 220;

    piece.style.setProperty('--x', `${x}px`);
    piece.style.setProperty('--y', `${y}px`);
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance + 140}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 900}deg`);
    piece.style.setProperty('--delay', `${Math.random() * 90}ms`);
    piece.style.background = COLOURS[i % COLOURS.length];
    if (i % 3 === 0) piece.style.borderRadius = '50%';

    layer.append(piece);
  }

  document.body.append(layer);
  setTimeout(() => layer.remove(), 1800);
}
