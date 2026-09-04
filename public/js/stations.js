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
import * as sp from './spotify.js';
import * as spPanel from './spotify-panel.js';
import * as yt from './youtube.js';
import * as ytPanel from './youtube-panel.js';

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
    // uri is derived rather than stored, so saved stations need no migration.
    return {
      kind: 'spotify',
      type: spotify[1],
      uri: `spotify:${spotify[1]}:${spotify[2]}`,
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
      videoId: ytVideo[1],
      listId: ytPlaylist ? ytPlaylist[1] : null,
      src: ytPlaylist
        ? `https://www.youtube.com/embed/${ytVideo[1]}?list=${ytPlaylist[1]}&autoplay=1&rel=0`
        : `https://www.youtube.com/embed/${ytVideo[1]}?autoplay=1&rel=0`,
      ratio: true,
    };
  }
  if (ytPlaylist && /youtube\.com/.test(url)) {
    return {
      kind: 'youtube',
      videoId: null,
      listId: ytPlaylist[1],
      src: `https://www.youtube.com/embed/videoseries?list=${ytPlaylist[1]}&autoplay=1&rel=0`,
      ratio: true,
    };
  }

  return null;
}

let chipsEl = null;
let playerEl = null;
let playingId = null;
let tucked = false;

export function mountStations(chips, player) {
  chipsEl = chips;
  playerEl = player;
  renderChips();
  subscribe(renderChips);
}

function renderChips() {
  if (!chipsEl) return;
  chipsEl.innerHTML = '';

  const stations = state.stations.filter(s => toEmbed(s.url));
  if (stations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'station-empty';
    empty.textContent = 'Add a Spotify or YouTube link in settings to play it here.';
    chipsEl.append(empty);
    return;
  }

  for (const station of stations) {
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
  // Audio outlives the DOM: the SDK plays from its own hidden iframe, so
  // replacing the player markup is not enough to silence it.
  spPanel.unmount();
  sp.pause().catch(() => {});
  ytPanel.unmount();
  yt.stop();
  playerEl.innerHTML = '';
  tucked = false;
  playerEl.classList.remove('is-tucked');

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

  const bar = document.createElement('div');
  bar.className = 'player-bar';

  const title = document.createElement('span');
  title.className = 'player-title';
  title.textContent = station.label || 'Playing';

  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'player-hide';
  hide.textContent = 'Hide';
  hide.setAttribute('aria-expanded', 'true');
  hide.addEventListener('click', toggleTuck);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'player-stop';
  close.textContent = 'Stop';
  close.addEventListener('click', stop);

  bar.append(title, hide, close);

  const stage = document.createElement('div');
  stage.className = 'player-stage';

  playerEl.hidden = false;
  playerEl.append(bar, stage);
  playingId = station.id;
  renderChips();

  if (embed.kind === 'spotify') routeSpotify(embed, stage, station);
  else if (embed.kind === 'youtube') routeYoutube(embed, stage, station);
  else stage.append(buildFrame(embed, station));
}

function buildFrame(embed, station) {
  const frame = document.createElement('iframe');
  frame.src = embed.src;
  frame.title = station.label || 'Player';
  frame.loading = 'lazy';
  frame.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.className = embed.ratio ? 'player-frame is-video' : 'player-frame';
  if (!embed.ratio) frame.height = embed.height;
  return frame;
}

/** Music goes through the Connect player for the full controls. Podcasts and
 *  browsers without Widevine can't use the SDK at all, so they keep the embed. */
function routeSpotify(embed, stage, station) {
  // Must happen inside the click, before any await, or the autoplay policy
  // blocks the first play. It is a no-op until the SDK player exists.
  sp.activate();

  const fallback = (note) => {
    stage.replaceChildren();
    if (note) stage.append(note);
    stage.append(buildFrame(embed, station));
  };

  (async () => {
    if (!sp.canPlay(embed.type) || !(await sp.isSupported())) {
      return fallback(null);
    }
    if (station.id !== playingId) return;

    const { connected } = await sp.status();
    if (station.id !== playingId) return;
    if (!connected) return fallback(connectPrompt(station));

    try {
      spPanel.mountStage(stage);
      await sp.start(embed.uri, embed.type);
    } catch (e) {
      console.warn('spotify connect player failed, using the embed', e);
      if (station.id === playingId) fallback(null);
    }
  })();
}

/** Mount the YouTube player with custom controls, falling back to raw embed on error. */
function routeYoutube(embed, stage, station) {
  const fallback = () => {
    ytPanel.unmount();
    yt.stop();
    stage.replaceChildren();
    stage.append(buildFrame(embed, station));
  };

  (async () => {
    try {
      await ytPanel.mountStage(stage, embed, station, fallback, () => station.id === playingId);
    } catch (e) {
      console.warn('youtube player failed, using the embed', e);
      if (station.id === playingId) fallback();
    }
  })();
}

/** Without this the richer player is undiscoverable — you would have to guess
 *  that settings has a Connect button. */
function connectPrompt(station) {
  const note = document.createElement('p');
  note.className = 'player-note';
  note.append('Connect Spotify for volume and shuffle. ');
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'player-connect';
  link.textContent = 'Connect';
  link.addEventListener('click', async () => {
    link.disabled = true;
    if (await sp.connect()) play(station);
    else link.disabled = false;
  });
  note.append(link);
  return note;
}

function toggleTuck() {
  if (tucked) showPlayer();
  else hidePlayer();
}

/** Collapse the chrome; the iframe stays so audio keeps going. */
export function hidePlayer() {
  if (!playerEl || playerEl.hidden || tucked) return;
  // Popped out to picture-in-picture the player lives in another document, and
  // tucking it there would hide it inside its own window.
  if (!document.contains(playerEl)) return;
  if (!playerEl.querySelector('.player-stage')) return;
  tucked = true;
  playerEl.classList.add('is-tucked');
  const hide = playerEl.querySelector('.player-hide');
  if (hide) {
    hide.textContent = 'Show';
    hide.setAttribute('aria-expanded', 'false');
  }
}

export function showPlayer() {
  if (!playerEl || playerEl.hidden || !tucked) return;
  tucked = false;
  playerEl.classList.remove('is-tucked');
  const hide = playerEl.querySelector('.player-hide');
  if (hide) {
    hide.textContent = 'Hide';
    hide.setAttribute('aria-expanded', 'true');
  }
}

export function stop() {
  tucked = false;
  sp.pause().catch(() => {});
  spPanel.unmount();
  yt.stop();
  ytPanel.unmount();
  playerEl.classList.remove('is-tucked');
  playerEl.innerHTML = '';
  playerEl.hidden = true;
  playingId = null;
  renderChips();
}

// ---------- Editor (rendered inside the settings dialog) ----------
export function mountStationsEditor(root) {
  let draft = null;

  const paint = () => {
    root.innerHTML = '';

    const appendRow = (station, isDraft = false) => {
      const row = document.createElement('div');
      row.className = 'edit-row';

      const label = document.createElement('input');
      label.type = 'text';
      label.value = station.label || '';
      label.placeholder = 'Name';
      label.setAttribute('aria-label', 'Station name');
      label.addEventListener('change', () => {
        station.label = label.value.trim();
        if (!isDraft) commit();
      });

      const url = document.createElement('input');
      url.type = 'text';
      url.value = station.url || '';
      url.placeholder = 'Spotify or YouTube link';
      url.setAttribute('aria-label', 'Station link');
      url.setAttribute('aria-invalid', String(Boolean(station.url) && !toEmbed(station.url)));
      url.addEventListener('change', () => {
        const next = url.value.trim();
        const embed = toEmbed(next);
        row.classList.toggle('is-invalid', Boolean(next) && !embed);
        url.setAttribute('aria-invalid', String(Boolean(next) && !embed));
        if (next && !embed) return;
        station.url = next;
        station.kind = embed?.kind || '';
        if (isDraft) {
          if (!embed) return;
          state.stations.push(station);
          draft = null;
          commit();
          paint();
        } else {
          commit();
        }
      });
      row.classList.toggle('is-invalid', Boolean(station.url) && !toEmbed(station.url));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'edit-remove';
      remove.textContent = '✕';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', `Remove ${station.label || station.url}`);
      remove.addEventListener('click', () => {
        if (isDraft) draft = null;
        else {
          if (station.id === playingId) stop();
          state.stations = state.stations.filter(s => s.id !== station.id);
          commit();
        }
        paint();
      });

      row.append(label, url, remove);
      root.append(row);
    };

    state.stations.forEach((station) => appendRow(station));
    if (draft) appendRow(draft, true);

    if (!draft) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'edit-add';
      add.textContent = 'Add a station';
      add.addEventListener('click', () => {
        draft = { id: uid(), label: '', url: '', kind: '' };
        paint();
        root.querySelector('.edit-row:last-of-type input')?.focus();
      });
      root.append(add);
    }
  };

  paint();
}
