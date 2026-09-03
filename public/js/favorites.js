// Favorite sites as letter-mark tiles.
//
// Monograms are the default rather than favicons: a favicon service means a
// third-party request for every site you've saved, on every new tab. The hue is
// derived from the label so tiles stay distinguishable at a glance without
// introducing colour as decoration. Settings can switch to real favicons.

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

  if (state.favorites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'fav-empty';
    empty.textContent = 'No sites saved yet. Add them in settings.';
    gridEl.append(empty);
    return;
  }

  state.favorites.forEach((fav, i) => {
    const a = document.createElement('a');
    a.className = 'fav';
    a.href = normalizeUrl(fav.url);
    a.title = `${i + 1} · ${fav.url}`;
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

    a.append(mark, label);
    gridEl.append(a);
  });
}

/** Open the favorite at a 0-based index. Used by the 1–8 shortcuts. */
export function openFavorite(index) {
  const fav = state.favorites[index];
  if (!fav || !fav.url) return false;
  window.open(normalizeUrl(fav.url), '_blank', 'noopener');
  return true;
}

// ---------- Editor (rendered inside the settings dialog) ----------
export function mountFavoritesEditor(root) {
  const paint = () => {
    root.innerHTML = '';

    state.favorites.forEach((fav) => {
      const row = document.createElement('div');
      row.className = 'edit-row';

      const label = document.createElement('input');
      label.type = 'text';
      label.value = fav.label || '';
      label.placeholder = 'Name';
      label.setAttribute('aria-label', 'Site name');
      label.addEventListener('change', () => { fav.label = label.value.trim(); commit(); });

      const url = document.createElement('input');
      url.type = 'text';
      url.value = fav.url || '';
      url.placeholder = 'example.com';
      url.setAttribute('aria-label', 'Site address');
      url.addEventListener('change', () => { fav.url = url.value.trim(); commit(); });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'edit-remove';
      remove.textContent = '✕';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', `Remove ${fav.label || fav.url}`);
      remove.addEventListener('click', () => {
        state.favorites = state.favorites.filter(f => f.id !== fav.id);
        commit();
        paint();
      });

      row.append(label, url, remove);
      root.append(row);
    });

    if (state.favorites.length < MAX_FAVORITES) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'edit-add';
      add.textContent = 'Add a site';
      add.addEventListener('click', () => {
        state.favorites.push({ id: uid(), label: '', url: '' });
        commit();
        paint();
        const inputs = root.querySelectorAll('.edit-row input');
        if (inputs.length) inputs[inputs.length - 2].focus();
      });
      root.append(add);
    }
  };

  paint();
}
