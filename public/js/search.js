import { state } from './store.js';

export const ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'google',     name: 'Google',     url: 'https://www.google.com/search?q=' },
  { id: 'bing',       name: 'Bing',       url: 'https://www.bing.com/search?q=' },
  { id: 'kagi',       name: 'Kagi',       url: 'https://kagi.com/search?q=' },
];

// `bare` prefixes match as the first word (`yt lo-fi`). The rest need a
// leading ! so ordinary queries like "so tired" stay searches.
export const BANGS = [
  { id: 'gh',   name: 'GitHub',         bare: true,  home: 'https://github.com',                     search: 'https://github.com/search?q=' },
  { id: 'yt',   name: 'YouTube',        bare: true,  home: 'https://www.youtube.com',                search: 'https://www.youtube.com/results?search_query=' },
  { id: 'mdn',  name: 'MDN',            bare: true,  home: 'https://developer.mozilla.org',          search: 'https://developer.mozilla.org/en-US/search?q=' },
  { id: 'npm',  name: 'npm',            bare: true,  home: 'https://www.npmjs.com',                  search: 'https://www.npmjs.com/search?q=' },
  { id: 'ddg',  name: 'DuckDuckGo',     bare: true,  home: 'https://duckduckgo.com',                 search: 'https://duckduckgo.com/?q=' },
  { id: 'kagi', name: 'Kagi',           bare: true,  home: 'https://kagi.com',                       search: 'https://kagi.com/search?q=' },
  { id: 'wa',   name: 'Wolfram',        bare: true,  home: 'https://www.wolframalpha.com',           search: 'https://www.wolframalpha.com/input?i=' },
  { id: 'tw',   name: 'X',              bare: true,  home: 'https://x.com',                          search: 'https://x.com/search?q=' },
  { id: 'w',    name: 'Wikipedia',      bare: true,  home: 'https://en.wikipedia.org',               search: 'https://en.wikipedia.org/w/index.php?search=' },
  { id: 'g',    name: 'Google',         bare: false, home: 'https://www.google.com',                 search: 'https://www.google.com/search?q=' },
  { id: 'so',   name: 'Stack Overflow', bare: false, home: 'https://stackoverflow.com',              search: 'https://stackoverflow.com/search?q=' },
  { id: 'r',    name: 'Reddit',         bare: false, home: 'https://www.reddit.com',                 search: 'https://www.reddit.com/search/?q=' },
  { id: 'maps', name: 'Maps',           bare: false, home: 'https://maps.google.com',                search: 'https://www.google.com/maps/search/?api=1&query=' },
];

function engine() {
  return ENGINES.find(e => e.id === state.search?.engine) || ENGINES[0];
}

function findBang(id) {
  const key = String(id || '').toLowerCase();
  return BANGS.find(b => b.id === key) || null;
}

function dest(bang, rest) {
  if (!rest) return { name: bang.name, url: bang.home, bang: true };
  return { name: bang.name, url: bang.search + encodeURIComponent(rest), bang: true };
}

/** Where a query will go. Empty input falls back to the default engine, no url. */
export function resolveSearch(raw) {
  const q = String(raw || '').trim();
  const current = engine();
  const fallback = {
    name: current.name,
    url: q ? current.url + encodeURIComponent(q) : null,
    bang: false,
  };
  if (!q) return fallback;

  const forced = q.match(/^!(\S+)(?:\s+([\s\S]*))?$/);
  if (forced) {
    const bang = findBang(forced[1]);
    if (!bang) return fallback;
    return dest(bang, (forced[2] || '').trim());
  }

  const spaced = q.match(/^(\S+)\s+([\s\S]+)$/);
  if (spaced) {
    const bang = findBang(spaced[1]);
    if (bang && bang.bare) return dest(bang, spaced[2].trim());
  }

  return fallback;
}

export function mountSearch(root, { autofocus = true } = {}) {
  root.innerHTML = `
    <form class="search" role="search">
      <input class="search-input" type="text" name="q" autocomplete="off"
             spellcheck="false" aria-label="Search the web" />
      <span class="search-engine"></span>
    </form>`;

  const form = root.querySelector('.search');
  const input = root.querySelector('.search-input');
  const label = root.querySelector('.search-engine');

  const paint = () => {
    const resolved = resolveSearch(input.value);
    label.textContent = resolved.name;
    label.classList.toggle('is-bang', resolved.bang);
    input.placeholder = `Search ${engine().name}`;
  };
  paint();

  input.addEventListener('input', paint);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const resolved = resolveSearch(input.value);
    if (!resolved.url) return;
    // A new tab, so a running timer and any playing station survive the search.
    // This is a user gesture, so popup blockers leave it alone.
    window.open(resolved.url, '_blank', 'noopener');
    // The page is still here afterwards, so clear the field rather than leaving
    // the last query sitting in it.
    input.value = '';
    paint();
  });

  if (autofocus) input.focus();
  return {
    focus: () => input.focus(),
    blur: () => input.blur(),
    paint,
  };
}
