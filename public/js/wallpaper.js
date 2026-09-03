// Optional picture behind the colour field. The mesh stays the default and
// the fallback: a wallpaper is one extra request (a URL) or none (a local
// folder), and nothing is fetched unless the owner turned it on.
//
// A folder handle can't live in the synced blob — it's a capability of this
// Chrome profile — so it sits in IndexedDB. The mode and a remote URL do sync.

import { state, commit, subscribe } from './store.js';

export const WALLPAPER_MODES = [
  { id: 'mesh',   name: 'Colour field' },
  { id: 'image',  name: 'A picture' },
  { id: 'folder', name: 'A folder of pictures' },
];

export const SLIDE_INTERVALS = [
  { id: 0,  name: 'When the tab opens' },
  { id: 1,  name: 'Every minute' },
  { id: 2,  name: 'Every 2 minutes' },
  { id: 5,  name: 'Every 5 minutes' },
  { id: 10, name: 'Every 10 minutes' },
  { id: 15, name: 'Every 15 minutes' },
  { id: 30, name: 'Every 30 minutes' },
];

const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;
const IDB_NAME = 'homepage';
const IDB_STORE = 'kv';
const KEY_DIR = 'wallpaper-dir';
const KEY_FILE = 'wallpaper-file';
const KEY_INDEX = 'homepage-wallpaper-index';

let root = null;
let layers = [];
let front = 0;
let objectUrl = null;
let slideTimer = null;
let files = [];
let status = { text: '', folder: '' };
let generation = 0;
let wallpaperSignature = '';

function signature() {
  const w = state.wallpaper || {};
  return `${w.mode || 'mesh'}|${w.url || ''}|${w.interval ?? 5}`;
}

export function wallpaperStatus() { return status; }
export function canPickFolder() { return typeof window.showDirectoryPicker === 'function'; }

export function mountWallpaper(node) {
  root = node;
  layers = [...node.querySelectorAll('.wallpaper-layer')];
  wallpaperSignature = signature();
  applyWallpaper();
  subscribe(() => {
    const next = signature();
    if (next === wallpaperSignature) return;
    wallpaperSignature = next;
    applyWallpaper();
  });
}

export async function applyWallpaper() {
  const run = ++generation;
  stopSlides();
  const mode = state.wallpaper?.mode || 'mesh';

  if (mode === 'mesh') {
    showPaper(false);
    setStatus('');
    return;
  }

  if (mode === 'image') {
    const local = await idbGet(KEY_FILE);
    if (run !== generation) return;
    if (local instanceof Blob) {
      showBlob(local);
      setStatus('Using a picture from this computer.');
      return;
    }
    const url = String(state.wallpaper?.url || '').trim();
    if (url && /^https?:\/\//i.test(url)) {
      const shown = await showRemote(url, run);
      if (run !== generation) return;
      if (shown) setStatus('Using the picture at that address.');
      return;
    }
    showPaper(false);
    setStatus(url ? 'Need an http(s) address.' : 'Paste an address or pick a picture.');
    return;
  }

  if (mode === 'folder') {
    if (!canPickFolder()) {
      showPaper(false);
      setStatus('Folder pictures need Chrome.');
      return;
    }
    const handle = await idbGet(KEY_DIR);
    if (run !== generation) return;
    if (!handle) {
      showPaper(false);
      setStatus('No folder chosen yet.');
      return;
    }
    const ok = await ensurePermission(handle);
    if (run !== generation) return;
    if (!ok) {
      showPaper(false);
      setStatus('Chrome needs permission to read that folder. Choose it again.');
      return;
    }
    try {
      files = await listImages(handle);
    } catch {
      if (run !== generation) return;
      showPaper(false);
      setStatus('Could not read that folder. Choose it again.');
      return;
    }
    if (run !== generation) return;
    status.folder = handle.name || '';
    if (files.length === 0) {
      showPaper(false);
      setStatus(`No pictures in “${status.folder}”.`);
      return;
    }
    setStatus(
      files.length === 1
        ? `Using “${status.folder}”.`
        : `${files.length} pictures in “${status.folder}”.`,
    );
    await showFolderIndex(nextIndex(files.length, { advance: true }), run);
    if (run !== generation) return;
    startSlides();
  }
}

export async function choosePicture() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/avif,image/gif';
    const done = async (file) => {
      if (!file) return resolve(false);
      await idbSet(KEY_FILE, file);
      state.wallpaper.mode = 'image';
      commit();
      await applyWallpaper();
      resolve(true);
    };
    input.addEventListener('change', () => done(input.files && input.files[0]));
    input.addEventListener('cancel', () => resolve(false));
    input.click();
  });
}

export async function chooseFolder() {
  if (!canPickFolder()) return false;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await idbSet(KEY_DIR, handle);
    state.wallpaper.mode = 'folder';
    commit();
    await applyWallpaper();
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
    console.warn('folder pick failed', e);
    setStatus('Could not open that folder.');
    return false;
  }
}

export async function clearLocalPicture() {
  await idbDel(KEY_FILE);
  await applyWallpaper();
}

export async function clearFolder() {
  await idbDel(KEY_DIR);
  files = [];
  localStorage.removeItem(KEY_INDEX);
  if ((state.wallpaper?.mode) === 'folder') {
    state.wallpaper.mode = 'mesh';
    commit();
  }
  await applyWallpaper();
}

function startSlides() {
  stopSlides();
  const mins = Number(state.wallpaper?.interval);
  if (!mins || files.length < 2) return;
  slideTimer = setInterval(() => {
    showFolderIndex(nextIndex(files.length, { advance: true })).catch(() => {});
  }, Math.max(1, mins) * 60_000);
}

function stopSlides() {
  clearInterval(slideTimer);
  slideTimer = null;
}

async function showFolderIndex(i, run = generation) {
  const entry = files[i];
  if (!entry) return;
  const file = await entry.getFile();
  if (run !== generation) return;
  showBlob(file);
}

function nextIndex(len, { advance }) {
  let i = Number(localStorage.getItem(KEY_INDEX)) || 0;
  if (!Number.isFinite(i) || i < 0) i = 0;
  i = i % len;
  if (advance) {
    const next = (i + 1) % len;
    localStorage.setItem(KEY_INDEX, String(next));
  }
  return i;
}

function showBlob(blob) {
  const url = URL.createObjectURL(blob);
  paintLayer(url);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = url;
}

function showRemote(url, run) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (run === generation) paintLayer(url);
      resolve(true);
    };
    img.onerror = () => {
      if (run === generation) {
        showPaper(false);
        setStatus('Could not load that picture.');
      }
      resolve(false);
    };
    img.src = url;
  });
}

function paintLayer(url) {
  if (!layers.length) return;
  const next = 1 - front;
  layers[next].style.backgroundImage = `url(${JSON.stringify(url)})`;
  layers[next].classList.add('is-show');
  layers[front].classList.remove('is-show');
  front = next;
  showPaper(true);
}

function showPaper(on) {
  if (!root) return;
  root.classList.toggle('is-on', on);
  document.documentElement.toggleAttribute('data-wallpaper', on);
}

function setStatus(text) {
  status = { ...status, text };
}

async function listImages(dir) {
  const out = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue;
    if (entry.name.startsWith('.')) continue;
    if (!IMAGE_RE.test(entry.name)) continue;
    out.push(entry);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
}

async function ensurePermission(handle) {
  try {
    const opts = { mode: 'read' };
    if (!handle.queryPermission) return true;
    let perm = await handle.queryPermission(opts);
    if (perm === 'granted') return true;
    if (perm === 'prompt' && handle.requestPermission) {
      perm = await handle.requestPermission(opts);
    }
    return perm === 'granted';
  } catch {
    return false;
  }
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function idbDel(key) {
  try {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const r = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  } catch {}
}
