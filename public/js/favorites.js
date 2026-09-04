// Favorite sites as letter-mark tiles.
//
// Monograms are the default rather than favicons: a favicon service means a
// third-party request for every site you've saved, on every new tab. Tiles stay
// white type on a white-0.10 wash — the letterforms do the distinguishing, so no
// decorative colour enters the field. Settings can switch to real favicons.

import { state, commit, uid, subscribe } from './store.js';

export const MAX_FAVORITES = 8;

export function normalizeUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

export function hostOf(url) {
  try { return new URL(normalizeUrl(url)).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export function isSafeFavorite(fav) {
  try {
    const url = new URL(normalizeUrl(fav && fav.url));
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

// Prefer the capitals people already read a name by — GitHub reads as GH, not
// GI; Hacker News as HN. Fall back to initials, then to the first two letters.
function monogram(fav) {
  const source = (fav.label || hostOf(fav.url) || '?').trim();

  const capitals = source.replace(/[^A-Z]/g, '');
  if (capitals.length >= 2) return capitals.slice(0, 2);

  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();

  return source.slice(0, 2).toUpperCase();
}

let gridEl = null;

export function mountFavorites(root) {
  gridEl = root;
  renderFavorites();
  subscribe(renderFavorites);
}

function renderFavorites() {
  if (!gridEl) return;
  gridEl.innerHTML = '';

  const favorites = state.favorites.filter(isSafeFavorite);
  if (favorites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'fav-empty';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'set-btn';
    action.textContent = 'Add a favorite';
    action.addEventListener('click', () => {
      document.getElementById('settings-open')?.click();
      requestAnimationFrame(() => {
        const editor = document.getElementById('favorites-editor');
        editor?.querySelector('.edit-add')?.click();
        editor?.querySelector('input')?.focus();
      });
    });
    empty.append('No favorites yet. ', action);
    gridEl.append(empty);
    return;
  }


  favorites.forEach((fav, i) => {
    const a = document.createElement('a');
    a.className = 'fav';
    a.href = normalizeUrl(fav.url);
    a.title = `${i + 1} · ${fav.url}`;
    // Exposes the 1–8 shortcut to assistive tech; the visible badge next to
    // the label shows it to everyone else.
    a.setAttribute('aria-keyshortcuts', String(i + 1));
    // New tab for the same reason as search. noopener also stops the opened
    // page reaching back through window.opener.
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const mark = document.createElement('span');
    mark.className = 'fav-mark';

    if (state.useFavicons && hostOf(fav.url)) {
      const img = document.createElement('img');
      img.src = `https://icons.duckduckgo.com/ip3/${hostOf(fav.url)}.ico`;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { mark.textContent = monogram(fav); }, { once: true });
      mark.append(img);
    } else {
      mark.textContent = monogram(fav);
    }

    const label = document.createElement('span');
    label.className = 'fav-label';
    label.textContent = fav.label || hostOf(fav.url);

    const key = document.createElement('span');
    key.className = 'fav-key';
    key.textContent = String(i + 1);
    key.setAttribute('aria-hidden', 'true');

    a.append(mark, label, key);
    gridEl.append(a);
  });
}

/** Open the favorite at a 0-based index. Used by the 1–8 shortcuts. */
export function openFavorite(index) {
  const fav = state.favorites.filter(isSafeFavorite)[index];
  if (!fav) return false;
  window.open(normalizeUrl(fav.url), '_blank', 'noopener');
  return true;
}

// ---------- Editor (rendered inside the settings dialog) ----------
export function mountFavoritesEditor(root) {
  let draft = null;

  const paint = () => {
    root.innerHTML = '';

    const appendRow = (fav, isDraft = false) => {
      const row = document.createElement('div');
      row.className = 'edit-row';

      const label = document.createElement('input');
      label.type = 'text';
      label.value = fav.label || '';
      label.placeholder = 'Name';
      label.setAttribute('aria-label', 'Site name');
      label.addEventListener('change', () => {
        fav.label = label.value.trim();
        if (!isDraft) commit();
      });

      const url = document.createElement('input');
      url.type = 'text';
      url.value = fav.url || '';
      url.placeholder = 'example.com';
      url.setAttribute('aria-label', 'Site address');

      // A red border on its own says something is wrong but not what, and the
      // colour is the only carrier. The message does both jobs.
      const err = document.createElement('p');
      err.className = 'edit-error';
      err.id = `fav-err-${fav.id}`;
      err.textContent = 'Use a web address, like example.com.';
      url.setAttribute('aria-describedby', err.id);

      const setInvalid = (bad) => {
        row.classList.toggle('is-invalid', bad);
        url.setAttribute('aria-invalid', String(bad));
        err.hidden = !bad;
      };
      setInvalid(Boolean(fav.url) && !isSafeFavorite(fav));

      url.addEventListener('change', () => {
        const next = url.value.trim();
        const candidate = { ...fav, url: next };
        const valid = !next || isSafeFavorite(candidate);
        setInvalid(!valid);
        if (!valid) return;
        fav.url = next;
        if (isDraft) {
          if (!next) return;
          state.favorites.push(fav);
          draft = null;
          commit();
          paint();
        } else {
          commit();
        }
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'edit-remove';
      remove.textContent = '✕';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', `Remove ${fav.label || fav.url}`);
      remove.addEventListener('click', () => {
        if (isDraft) draft = null;
        else {
          state.favorites = state.favorites.filter(f => f.id !== fav.id);
          commit();
        }
        paint();
      });

      row.append(label, url, remove, err);
      root.append(row);
      return label;
    };

    state.favorites.forEach((fav) => appendRow(fav));
    if (draft) appendRow(draft, true);

    if (state.favorites.length + (draft ? 1 : 0) < MAX_FAVORITES) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'edit-add';
      add.textContent = 'Add a favorite';
      add.addEventListener('click', () => {
        draft = { id: uid(), label: '', url: '' };
        paint();
        root.querySelector('.edit-row:last-of-type input')?.focus();
      });
      root.append(add);
    }
  };

  paint();
}
