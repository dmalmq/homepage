// The Spotify player as rendered. Logic lives in spotify.js; this file only
// draws it and forwards clicks, the same split as pomodoro.js / timer-panel.js.

import * as sp from './spotify.js';

const ICONS = {
  shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  prev: ['M19 20L9 12l10-8v16z', 'M5 19V5'],
  next: ['M5 4l10 8-10 8V4z', 'M19 5v14'],
  play: ['M5 3l14 9-14 9V3z'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  repeat: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 014-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 01-4 4H3'],
  volume: ['M11 5L6 9H2v6h4l5 4V5z', 'M19.07 4.93a10 10 0 010 14.14', 'M15.54 8.46a5 5 0 010 7.07'],
  pip: ['M15 3h6v6', 'M10 14L21 3', 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6'],
};

function icon(name, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICONS[name]) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function button(name, label, cls = 'sp-btn') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(icon(name));
  return b;
}

const setFill = (el, ratio) => {
  el.style.setProperty('--fill', `${Math.max(0, Math.min(1, ratio)) * 100}%`);
};

function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function pipSupported() {
  return 'documentPictureInPicture' in window;
}

let teardown = null;

/** Stop the ticker and the subscription. Safe to call when nothing is mounted. */
export function unmount() {
  if (teardown) teardown();
}

/** Fill a .player-stage with the Spotify controls. Returns a teardown that
 *  unsubscribes and stops the ticker. */
export function mountStage(stage) {
  if (teardown) teardown();

  const head = document.createElement('div');
  head.className = 'sp-head';
  const art = document.createElement('img');
  art.className = 'sp-art';
  art.alt = '';
  const meta = document.createElement('div');
  meta.className = 'sp-meta';
  const title = document.createElement('span');
  title.className = 'sp-title';
  const artist = document.createElement('span');
  artist.className = 'sp-artist';
  meta.append(title, artist);
  head.append(art, meta);

  if (pipSupported()) {
    const pip = button('pip', 'Pop out', 'sp-btn sp-btn--quiet');
    pip.addEventListener('click', () => popOut(stage.closest('.player')));
    head.append(pip);
  }

  const seek = document.createElement('input');
  seek.type = 'range';
  seek.className = 'sp-seek';
  seek.min = '0';
  seek.max = '1000';
  seek.value = '0';
  seek.setAttribute('aria-label', 'Seek');

  const times = document.createElement('div');
  times.className = 'sp-times';
  const now = document.createElement('span');
  const end = document.createElement('span');
  times.append(now, end);

  const transport = document.createElement('div');
  transport.className = 'sp-transport';
  const shuffle = button('shuffle', 'Shuffle');
  const prev = button('prev', 'Previous');
  const play = button('play', 'Play', 'sp-btn sp-btn--play');
  const next = button('next', 'Next');
  const repeat = button('repeat', 'Repeat');
  transport.append(shuffle, prev, play, next, repeat);

  const vol = document.createElement('div');
  vol.className = 'sp-volume';
  const volIcon = icon('volume', 14);
  const volRange = document.createElement('input');
  volRange.type = 'range';
  volRange.className = 'sp-vol';
  volRange.min = '0';
  volRange.max = '1';
  volRange.step = '0.01';
  volRange.value = String(sp.storedVolume());
  volRange.setAttribute('aria-label', 'Volume');
  vol.append(volIcon, volRange);

  stage.replaceChildren(head, seek, times, transport, vol);

  // ---------- wiring ----------

  let seeking = false;
  let duration = 0;

  play.addEventListener('click', () => sp.togglePlay());
  prev.addEventListener('click', () => sp.previous());
  next.addEventListener('click', () => sp.next());
  shuffle.addEventListener('click', () => {
    const s = sp.getState();
    sp.setShuffle(!(s && s.shuffle));
  });
  repeat.addEventListener('click', () => {
    const s = sp.getState();
    const modes = ['off', 'context', 'track'];
    sp.setRepeat(modes[(((s && s.repeat) || 0) + 1) % 3]);
  });
  volRange.addEventListener('input', () => {
    sp.setVolume(Number(volRange.value));
    setFill(volRange, Number(volRange.value));
  });
  setFill(volRange, Number(volRange.value));

  seek.addEventListener('pointerdown', () => { seeking = true; });
  const commitSeek = () => {
    if (!seeking) return;
    seeking = false;
    if (duration) sp.seek((Number(seek.value) / 1000) * duration);
  };
  seek.addEventListener('change', commitSeek);
  seek.addEventListener('pointerup', commitSeek);
  seek.addEventListener('input', () => {
    setFill(seek, Number(seek.value) / 1000);
    if (duration) now.textContent = clock((Number(seek.value) / 1000) * duration);
  });

  function paintState(s) {
    stage.classList.toggle('is-idle', !s);
    if (!s) {
      title.textContent = 'Playing elsewhere';
      artist.textContent = '';
      art.removeAttribute('src');
      return;
    }
    duration = s.duration;
    title.textContent = s.track ? s.track.name : '';
    artist.textContent = s.track ? s.track.artists : '';
    if (s.track && s.track.art) art.src = s.track.art;
    else art.removeAttribute('src');

    play.replaceChildren(icon(s.paused ? 'play' : 'pause'));
    play.title = s.paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', play.title);

    shuffle.classList.toggle('is-on', Boolean(s.shuffle));
    shuffle.setAttribute('aria-pressed', String(Boolean(s.shuffle)));
    repeat.classList.toggle('is-on', s.repeat > 0);
    repeat.dataset.mode = ['off', 'context', 'track'][s.repeat] || 'off';

    // The state object says what this context actually allows, so the buttons
    // can be honest instead of guessing.
    prev.disabled = Boolean(s.disallows.skipping_prev);
    next.disabled = Boolean(s.disallows.skipping_next);
    shuffle.disabled = Boolean(s.disallows.toggling_shuffle);
    repeat.disabled = Boolean(s.disallows.toggling_repeat_context);

    end.textContent = clock(s.duration);
  }

  function tick() {
    const s = sp.getState();
    if (!s || seeking) return;
    const pos = sp.currentPosition();
    const ratio = s.duration ? pos / s.duration : 0;
    now.textContent = clock(pos);
    seek.value = String(Math.round(ratio * 1000));
    setFill(seek, ratio);
  }

  const unsub = sp.subscribe(paintState);
  const timer = setInterval(tick, 500);
  const onVisible = () => { if (!document.hidden) sp.resync(); };
  document.addEventListener('visibilitychange', onVisible);

  paintState(sp.getState());
  tick();

  teardown = () => {
    unsub();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    teardown = null;
  };
  return teardown;
}

// ---------- document picture-in-picture ----------

/** Move the whole player into an always-on-top window. This is only possible
 *  because the player is our own DOM now — an iframe reloads when adopted into
 *  another document, which is what the embed could never survive. The SDK's own
 *  audio element is never moved, so sound continues. */
async function popOut(playerEl) {
  if (!pipSupported() || !playerEl) return;

  const open = window.documentPictureInPicture.window;
  if (open) open.close();

  const pip = await window.documentPictureInPicture.requestWindow({
    width: 320,
    height: 360,
  });

  // Link the stylesheet rather than inlining its text: the @font-face url() is
  // relative, and inlined it would resolve against the pip document and 404.
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const clone = pip.document.createElement('link');
    clone.rel = 'stylesheet';
    clone.href = link.href;
    pip.document.head.append(clone);
  }

  // The ground colour and the wallpaper ink overrides hang off <html>; without
  // them the glass renders black.
  const root = document.documentElement;
  if (root.dataset.phase) pip.document.documentElement.dataset.phase = root.dataset.phase;
  if (root.hasAttribute('data-wallpaper')) {
    pip.document.documentElement.setAttribute('data-wallpaper', '');
  }
  pip.document.body.className = 'pip-body';

  // A marker holds the player's place so it goes back where it came from.
  const home = document.createComment('player-home');
  playerEl.before(home);
  playerEl.classList.add('is-pip');
  pip.document.body.append(playerEl);

  pip.addEventListener('pagehide', () => {
    playerEl.classList.remove('is-pip');
    if (home.parentNode) home.replaceWith(playerEl);
    else document.body.append(playerEl);
  }, { once: true });
}
