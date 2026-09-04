// YouTube IFrame Player API controller.
//
// Like Spotify Connect, this script is fetched only on the first play and never
// on load, preserving the new-tab page load budget.
//
// While Spotify Web Playback SDK provides a headless audio device, YouTube's
// API controls an iframe video player. By setting controls: 0, we can hide the
// default YouTube chrome and drive custom transport, seek, volume, and playlist
// controls in our own DOM.

const SDK_URL = 'https://www.youtube.com/iframe_api';
const VOLUME_KEY = 'homepage.youtube.volume';

let apiLoading = null;
let player = null;
let lastState = null;
let isShuffled = false;
let isLooped = false;
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(lastState); } catch (e) { console.warn('youtube listener failed', e); }
  }
}

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = String(m % 60).padStart(2, '0');
    return `${h}:${remM}:${s}`;
  }
  return `${m}:${s}`;
}

export function storedVolume() {
  const ytVol = Number(localStorage.getItem(VOLUME_KEY));
  if (Number.isFinite(ytVol) && ytVol >= 0 && ytVol <= 1) return ytVol;
  const spVol = Number(localStorage.getItem('homepage.spotify.volume'));
  if (Number.isFinite(spVol) && spVol >= 0 && spVol <= 1) return spVol;
  return 0.6;
}

export function loadApi() {
  if (typeof window !== 'undefined' && window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (apiLoading) return apiLoading;

  apiLoading = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      apiLoading = null;
      reject(new Error('YouTube API timed out'));
    }, 12000);

    const checkReady = () => {
      if (window.YT && window.YT.Player) {
        clearTimeout(timeout);
        resolve(window.YT);
        return true;
      }
      return false;
    };

    if (checkReady()) return;

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      checkReady();
    };

    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (!existing) {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onerror = () => {
        clearTimeout(timeout);
        apiLoading = null;
        reject(new Error('YouTube API failed to load'));
      };
      document.head.append(s);
    }
  });

  return apiLoading;
}

function updateState() {
  if (!player) return;
  let playerState = -1;
  let currentTime = 0;
  let duration = 0;
  let videoData = {};
  let playlist = null;

  try { if (typeof player.getPlayerState === 'function') playerState = player.getPlayerState(); } catch {}
  try { if (typeof player.getCurrentTime === 'function') currentTime = player.getCurrentTime() || 0; } catch {}
  try { if (typeof player.getDuration === 'function') duration = player.getDuration() || 0; } catch {}
  try { if (typeof player.getVideoData === 'function') videoData = player.getVideoData() || {}; } catch {}
  try { if (typeof player.getPlaylist === 'function') playlist = player.getPlaylist(); } catch {}

  const hasPlaylist = Array.isArray(playlist) && playlist.length > 1;

  lastState = {
    playerState,
    paused: playerState !== 1, // 1 is PLAYING
    buffering: playerState === 3,
    currentTime,
    duration,
    title: videoData.title || lastState?.title || '',
    author: videoData.author || lastState?.author || '',
    videoId: videoData.video_id || lastState?.videoId || '',
    hasPlaylist,
    shuffle: isShuffled,
    loop: isLooped,
  };
  emit();
}

export function getState() {
  return lastState;
}

export function currentPosition() {
  if (!player) return lastState?.currentTime || 0;
  try {
    return player.getCurrentTime() || 0;
  } catch {
    return lastState?.currentTime || 0;
  }
}

export function currentDuration() {
  if (!player) return lastState?.duration || 0;
  try {
    return player.getDuration() || 0;
  } catch {
    return lastState?.duration || 0;
  }
}

export function resync() {
  updateState();
}

export async function start(containerEl, embed) {
  await loadApi();

  if (player) {
    try {
      player.stopVideo();
      player.destroy();
    } catch {}
    player = null;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const bail = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('YouTube player initialization timed out'));
      }
    }, 15000);

    const playerVars = {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      enablejsapi: 1,
    };

    if (window.location.origin && window.location.origin !== 'null') {
      playerVars.origin = window.location.origin;
    }

    if (embed.videoId) {
      if (embed.listId) {
        playerVars.list = embed.listId;
      }
    } else if (embed.listId) {
      playerVars.listType = 'playlist';
      playerVars.list = embed.listId;
    }

    const config = {
      playerVars,
      events: {
        onReady: (e) => {
          if (!settled) {
            settled = true;
            clearTimeout(bail);
            resolve(player);
          }
          const iframe = typeof e.target.getIframe === 'function' ? e.target.getIframe() : null;
          if (iframe) {
            iframe.className = 'player-frame is-video';
            iframe.title = 'YouTube player';
            iframe.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen';
          }
          const vol = storedVolume();
          try {
            e.target.setVolume(Math.round(vol * 100));
            if (vol > 0) e.target.unMute();
          } catch {}
          try { e.target.playVideo(); } catch {}
          updateState();
        },
        onStateChange: (e) => {
          updateState();
          // Loop video if ended and loop is active
          if (e.data === (window.YT?.PlayerState?.ENDED ?? 0) && isLooped) {
            try {
              e.target.seekTo(0, true);
              e.target.playVideo();
            } catch {}
          }
        },
        onError: (e) => {
          console.warn('YouTube player error', e.data);
          if (!settled) {
            settled = true;
            clearTimeout(bail);
            reject(new Error(`YouTube player error ${e.data}`));
          }
        },
      },
    };

    if (embed.videoId) {
      config.videoId = embed.videoId;
    }

    try {
      player = new window.YT.Player(containerEl, config);
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(bail);
        reject(err);
      }
    }
  });
}

export function togglePlay() {
  if (!player) return;
  try {
    const s = player.getPlayerState();
    if (s === (window.YT?.PlayerState?.PLAYING ?? 1)) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  } catch {
    try { player.playVideo(); } catch {}
  }
}

export function pause() {
  if (player && typeof player.pauseVideo === 'function') {
    try { player.pauseVideo(); } catch {}
  }
}

export function play() {
  if (player && typeof player.playVideo === 'function') {
    try { player.playVideo(); } catch {}
  }
}

export function next() {
  if (player && typeof player.nextVideo === 'function') {
    try { player.nextVideo(); } catch {}
  }
}

export function previous() {
  if (player && typeof player.previousVideo === 'function') {
    try { player.previousVideo(); } catch {}
  }
}

export function seek(seconds) {
  if (player && typeof player.seekTo === 'function') {
    try { player.seekTo(Math.max(0, seconds), true); } catch {}
  }
}

export function setVolume(v) {
  const clamped = Math.min(1, Math.max(0, v));
  localStorage.setItem(VOLUME_KEY, String(clamped));
  if (player) {
    try {
      if (typeof player.unMute === 'function' && clamped > 0) player.unMute();
      if (typeof player.setVolume === 'function') player.setVolume(Math.round(clamped * 100));
    } catch {}
  }
}

export function setShuffle(on) {
  isShuffled = Boolean(on);
  if (player && typeof player.setShuffle === 'function') {
    try { player.setShuffle(isShuffled); } catch {}
  }
  updateState();
}

export function setLoop(on) {
  isLooped = Boolean(on);
  if (player && typeof player.setLoop === 'function') {
    try { player.setLoop(isLooped); } catch {}
  }
  updateState();
}

export function stop() {
  if (player) {
    try {
      if (typeof player.stopVideo === 'function') player.stopVideo();
      if (typeof player.destroy === 'function') player.destroy();
    } catch (e) {
      console.warn('YouTube destroy error', e);
    }
    player = null;
  }
  lastState = null;
  emit();
}
