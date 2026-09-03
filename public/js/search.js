import { state } from './store.js';

export const ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'google',     name: 'Google',     url: 'https://www.google.com/search?q=' },
  { id: 'bing',       name: 'Bing',       url: 'https://www.bing.com/search?q=' },
  { id: 'kagi',       name: 'Kagi',       url: 'https://kagi.com/search?q=' },
];

function engine() {
  return ENGINES.find(e => e.id === state.search?.engine) || ENGINES[0];
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
    label.textContent = engine().name;
    input.placeholder = `Search ${engine().name}`;
  };
  paint();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    // A new tab, so a running timer and any playing station survive the search.
    // This is a user gesture, so popup blockers leave it alone.
    window.open(engine().url + encodeURIComponent(q), '_blank', 'noopener');
    // The page is still here afterwards, so clear the field rather than leaving
    // the last query sitting in it.
    input.value = '';
  });

  if (autofocus) input.focus();
  return { focus: () => input.focus(), paint };
}
