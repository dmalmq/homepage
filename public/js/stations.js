// Listen — Spotify and YouTube embeds, loaded only on click.
//
// This page is a new-tab page, so nothing here may cost anything on load. No
// iframe exists in the DOM until you pick a station; until then a station is
// just a stored URL and a text chip.
//
// Worth knowing: audio lives in the tab that started it. Opening a new tab gives
// you a fresh page with no player, so keep one tab around for music.
//
// Embeds go through www.youtube.com rather than youtube-nocookie.com. The
// nocookie domain is the more private choice, but it's widely blocked by
// ad/tracker filters and DNS blocklists, and when it's blocked the iframe shows
// a browser error page rather than anything explicable. Reliability wins here.

import { state, commit, uid, subscribe } from './store.js';

const SPOTIFY_TYPES = 'track|album|playlist|artist|episode|show';

/** Parse a Spotify or YouTube URL into an embeddable source. Returns null if the
 *  link isn't one we can embed, so the caller can say so plainly. */
export function toEmbed(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return null;

  const spotifyUri = url.match(new RegExp(`^spotify:(${SPOTIFY_TYPES}):([A-Za-z0-9]+)`));
  const spotifyWeb = url.match(new RegExp(`open\.spotify\.com/(?:intl-[a-z-]+/)?(${SPOTIFY_TYPES})/([A-Za-z0-9]+)`));
  const spotify = spotifyUri || spotifyWeb;
  if (spotify) {
    return {
      kind: 'spotify',
      src: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`,
      height: 152,
    };
  }

  const ytPlaylist = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  // /live/ is how YouTube shares an ongoing stream, and /v/ is the legacy form.
  // Missing them meant a live URL silently failed to parse.
  const ytVideo = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytVideo) {
    return {
      kind: 'youtube',
      src: `https://www.youtube.com/embed/${ytVideo[1]}?autoplay=1&rel=0`,
      ratio: true,
    };
  }
  if (ytPlaylist && /youtube\.com/.test(url)) {
    return {
      kind: 'youtube',
      src: `https://www.youtube.com/embed/videoseries?list=${ytPlaylist[1]}&autoplay=1&rel=0`,
      ratio: true,
    };
  }

  return null;
}

let chipsEl = null;
let playerEl = null;
let playingId = null;

export function mountStations(chips, player) {
  chipsEl = chips;
  playerEl = player;
  renderChips();
  subscribe(renderChips);
}

function renderChips() {
  if (!chipsEl) return;
  chipsEl.innerHTML = '';

  if (state.stations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'station-empty';
    empty.textContent = 'Add a Spotify or YouTube link in settings to play it here.';
    chipsEl.append(empty);
    return;
  }

  for (const station of state.stations) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'station';
    chip.classList.toggle('is-playing', station.id === playingId);
    chip.dataset.kind = station.kind || (toEmbed(station.url)?.kind ?? '');
    chip.textContent = station.label || station.url;
    chip.addEventListener('click', () => {
      if (station.id === playingId) stop();
      else play(station);
    });
    chipsEl.append(chip);
  }
}

export function play(station) {
  const embed = toEmbed(station.url);
  playerEl.innerHTML = '';

  if (!embed) {
    playerEl.hidden = false;
    const msg = document.createElement('p');
    msg.className = 'player-note';
    msg.textContent = 'That link isn’t a Spotify or YouTube address we can play. Check it in settings.';
    playerEl.append(msg);
    playingId = null;
    renderChips();
    return;
  }

  const frame = document.createElement('iframe');
  frame.src = embed.src;
  frame.title = station.label || 'Player';
  frame.loading = 'lazy';
  frame.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.className = embed.ratio ? 'player-frame is-video' : 'player-frame';
  if (!embed.ratio) frame.height = embed.height;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'player-close';
  close.textContent = 'Stop';
  close.addEventListener('click', stop);

  playerEl.hidden = false;
  playerEl.append(close, frame);
  playingId = station.id;
  renderChips();
}

export function stop() {
  playerEl.innerHTML = '';
  playerEl.hidden = true;
  playingId = null;
  renderChips();
}

// ---------- Editor (rendered inside the settings dialog) ----------
export function mountStationsEditor(root) {
  const paint = () => {
    root.innerHTML = '';

    state.stations.forEach((station) => {
      const row = document.createElement('div');
      row.className = 'edit-row';

      const label = document.createElement('input');
      label.type = 'text';
      label.value = station.label || '';
      label.placeholder = 'Name';
      label.setAttribute('aria-label', 'Station name');
      label.addEventListener('change', () => { station.label = label.value.trim(); commit(); });

      const url = document.createElement('input');
      url.type = 'text';
      url.value = station.url || '';
      url.placeholder = 'Spotify or YouTube link';
      url.setAttribute('aria-label', 'Station link');
      url.addEventListener('change', () => {
        station.url = url.value.trim();
        station.kind = toEmbed(station.url)?.kind || '';
        row.classList.toggle('is-invalid', Boolean(station.url) && !station.kind);
        commit();
      });
      row.classList.toggle('is-invalid', Boolean(station.url) && !toEmbed(station.url));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'edit-remove';
      remove.textContent = '✕';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', `Remove ${station.label || station.url}`);
      remove.addEventListener('click', () => {
        if (station.id === playingId) stop();
        state.stations = state.stations.filter(s => s.id !== station.id);
        commit();
        paint();
      });

      row.append(label, url, remove);
      root.append(row);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'edit-add';
    add.textContent = 'Add a station';
    add.addEventListener('click', () => {
      state.stations.push({ id: uid(), label: '', url: '', kind: '' });
      commit();
      paint();
    });
    root.append(add);
  };

  paint();
}
