// The YouTube player as rendered in .player-stage.
//
// Like spotify-panel.js, this file renders the custom controls (title, channel,
// seek slider, elapsed/duration time, transport buttons, volume) and wires them
// to the YouTube controller in youtube.js.

import * as yt from './youtube.js';

const ICONS = {
  shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  prev: ['M19 20L9 12l10-8v16z', 'M5 19V5'],
  next: ['M5 4l10 8-10 8V4z', 'M19 5v14'],
  play: ['M5 3l14 9-14 9V3z'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  repeat: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 014-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 01-4 4H3'],
  volume: ['M11 5L6 9H2v6h4l5 4V5z', 'M19.07 4.93a10 10 0 010 14.14', 'M15.54 8.46a5 5 0 010 7.07'],
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

let teardown = null;

export function unmount() {
  if (teardown) teardown();
}

/** Mount the YouTube video and native-looking controls into a .player-stage. */
export async function mountStage(stage, embed, station, fallback, isActive) {
  if (teardown) teardown();

  const wrap = document.createElement('div');
  wrap.className = 'yt-video-wrap';
  const target = document.createElement('div');
  target.id = 'yt-player-' + Math.random().toString(36).slice(2);
  wrap.append(target);

  const meta = document.createElement('div');
  meta.className = 'yt-meta';
  const title = document.createElement('span');
  title.className = 'yt-title';
  title.textContent = station.label || 'YouTube';
  const author = document.createElement('span');
  author.className = 'yt-author';
  meta.append(title, author);

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
  now.textContent = '0:00';
  const end = document.createElement('span');
  end.textContent = '0:00';
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
  volRange.value = String(yt.storedVolume());
  volRange.setAttribute('aria-label', 'Volume');
  vol.append(volIcon, volRange);

  stage.replaceChildren(wrap, meta, seek, times, transport, vol);

  // ---------- wiring ----------

  let seeking = false;

  play.addEventListener('click', () => yt.togglePlay());
  prev.addEventListener('click', () => yt.previous());
  next.addEventListener('click', () => yt.next());
  shuffle.addEventListener('click', () => {
    const s = yt.getState();
    yt.setShuffle(!s?.shuffle);
  });
  repeat.addEventListener('click', () => {
    const s = yt.getState();
    yt.setLoop(!s?.loop);
  });

  volRange.addEventListener('input', () => {
    const v = Number(volRange.value);
    yt.setVolume(v);
    setFill(volRange, v);
  });
  setFill(volRange, Number(volRange.value));

  seek.addEventListener('pointerdown', () => { seeking = true; });
  const commitSeek = () => {
    if (!seeking) return;
    seeking = false;
    const dur = yt.currentDuration();
    if (dur > 0) yt.seek((Number(seek.value) / 1000) * dur);
  };
  seek.addEventListener('change', commitSeek);
  seek.addEventListener('pointerup', commitSeek);
  seek.addEventListener('input', () => {
    setFill(seek, Number(seek.value) / 1000);
    const dur = yt.currentDuration();
    if (dur > 0) now.textContent = yt.formatTime((Number(seek.value) / 1000) * dur);
  });

  function paintState(s) {
    if (!s) return;

    if (s.title) title.textContent = s.title;
    else title.textContent = station.label || 'YouTube';

    author.textContent = s.author || '';

    play.replaceChildren(icon(s.paused ? 'play' : 'pause'));
    play.title = s.paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', play.title);

    shuffle.disabled = !s.hasPlaylist;
    shuffle.classList.toggle('is-on', Boolean(s.shuffle));
    shuffle.setAttribute('aria-pressed', String(Boolean(s.shuffle)));

    prev.disabled = !s.hasPlaylist;
    next.disabled = !s.hasPlaylist;

    repeat.classList.toggle('is-on', Boolean(s.loop));
    repeat.setAttribute('aria-pressed', String(Boolean(s.loop)));

    if (s.duration <= 0) {
      end.textContent = 'LIVE';
      seek.disabled = true;
    } else {
      end.textContent = yt.formatTime(s.duration);
      seek.disabled = false;
    }
  }

  function tick() {
    const s = yt.getState();
    if (!s || seeking) return;

    const dur = yt.currentDuration();
    const pos = yt.currentPosition();

    if (dur <= 0) {
      now.textContent = yt.formatTime(pos);
      end.textContent = 'LIVE';
      seek.value = '1000';
      setFill(seek, 1);
      seek.disabled = true;
      return;
    }

    seek.disabled = false;
    const ratio = dur > 0 ? pos / dur : 0;
    now.textContent = yt.formatTime(pos);
    end.textContent = yt.formatTime(dur);
    seek.value = String(Math.round(ratio * 1000));
    setFill(seek, ratio);

    if (s.title && title.textContent !== s.title) {
      title.textContent = s.title;
    }
    if (s.author && author.textContent !== s.author) {
      author.textContent = s.author;
    }
  }

  try {
    await yt.start(target, embed);
  } catch (err) {
    if (typeof fallback === 'function') {
      fallback();
      return;
    }
    throw err;
  }

  if (typeof isActive === 'function' && !isActive()) {
    yt.stop();
    return;
  }

  const unsub = yt.subscribe(paintState);
  const timer = setInterval(tick, 500);

  paintState(yt.getState());
  tick();

  teardown = () => {
    unsub();
    clearInterval(timer);
    teardown = null;
  };

  return teardown;
}
