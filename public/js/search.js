import { state, subscribe } from './store.js';

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
// Local commands run without a network request. Checked before bare bangs so
// `t buy milk` adds a task rather than searching; `!t buy milk` still forces
// a web search via the unknown-bang fallback in resolveSearch.
export function tryEvaluateMath(raw) {
  const expr = String(raw || '').trim();
  if (!expr || expr.length > 60) return null;
  if (!/^[0-9\s+\-*/%().]+$/.test(expr)) return null;
  if (!/\d/.test(expr) || !/[+\-*/%()]/.test(expr)) return null;
  // `//` and `/*` would open a JS comment inside the Function body below.
  if (expr.includes('//') || expr.includes('/*')) return null;
  let depth = 0;
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')' && --depth < 0) return null;
  }
  if (depth !== 0) return null;
  let value;
  try {
    value = Function(`"use strict";return(${expr})`)();
  } catch { return null; }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value) >= 1e15) return null;
  return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(4)));
}

function short(s, n = 32) {
  const v = String(s || '').trim().replace(/\s+/g, ' ');
  return v.length > n ? v.slice(0, n - 1) + '…' : v;
}

/** A local command, or null when the query is a plain web search. */
export function parseLocalCommand(raw) {
  const q = String(raw || '').trim();
  if (!q) return null;
  let m = q.match(/^(?:tl|later)\s+([\s\S]+)$/i);
  if (m && m[1].trim()) {
    return { name: `Later: ${short(m[1])}`, url: null, bang: true, local: { kind: 'task', list: 'later', text: m[1].trim().slice(0, 120) } };
  }
  m = q.match(/^t\s+([\s\S]+)$/i);
  if (m && m[1].trim()) {
    return { name: `Task: ${short(m[1])}`, url: null, bang: true, local: { kind: 'task', list: 'today', text: m[1].trim().slice(0, 120) } };
  }
  m = q.match(/^n\s+([\s\S]+)$/i);
  if (m && m[1].trim()) {
    return { name: `Note: ${short(m[1])}`, url: null, bang: true, local: { kind: 'note', text: m[1].trim() } };
  }
  m = q.match(/^(?:timer|focus|break)\s+(\d+(?:\.\d+)?)\s*(?:m(?:ins?)?)?$/i);
  if (m) {
    const minutes = Math.min(180, Math.max(1, Math.round(Number(m[1]))));
    const mode = m[0].toLowerCase().startsWith('break') ? 'short' : 'pomodoro';
    return { name: `Start ${minutes}m ${mode === 'short' ? 'break' : 'focus'}`, url: null, bang: true, local: { kind: 'timer', mode, minutes } };
  }
  const math = tryEvaluateMath(q);
  if (math !== null) {
    return { name: `= ${math}`, url: null, bang: true, local: { kind: 'calc', value: math, expr: q } };
  }
  return null;
}

/** Ranked suggestions for the palette. Item 0 always mirrors resolveSearch,
 *  so plain Enter behaves exactly as before; the rest are explicit picks —
 *  bang prefix matches plus a web-search escape when the query reads as a
 *  local command. Pure — tested in logic.test.js. */
export function suggestSearch(raw) {
  const q = String(raw || '').trim();
  if (!q) return [];
  const current = engine();
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (seen.has(item.key) || items.length >= 6) return;
    seen.add(item.key);
    items.push(item);
  };

  push(describePrimary(resolveSearch(q), q));
  if (items[0].kind !== 'engine') {
    push({
      key: `engine:${current.id}`,
      kind: 'engine',
      tag: '⌕',
      name: `Search ${current.name} for “${short(q)}”`,
      detail: 'Web search',
      url: current.url + encodeURIComponent(q),
    });
  }

  const first = (q.match(/^!?(\S+)/) || [])[1] || '';
  if (first) {
    const f = first.toLowerCase();
    for (const b of BANGS) {
      if (!b.id.toLowerCase().startsWith(f)) continue;
      const d = bangChoice(b, q);
      push({
        key: `bang:${b.id}`,
        kind: 'bang',
        tag: b.id.toUpperCase(),
        name: d.rest ? `${b.name} — “${short(d.rest)}”` : `Open ${b.name}`,
        detail: b.bare ? `${b.id} …` : `!${b.id} …`,
        url: d.url,
      });
    }
  }
  return items;
}

/** What choosing a prefix-matched bang navigates to. */
function bangChoice(b, q) {
  const forced = q.match(/^!(\S+)(?:\s+([\s\S]*))?$/);
  if (forced && forced[1].toLowerCase() === b.id) {
    const rest = (forced[2] || '').trim();
    return { ...dest(b, rest), rest };
  }
  const spaced = q.match(/^(\S+)\s+([\s\S]+)$/);
  if (spaced && spaced[1].toLowerCase() === b.id) {
    return { ...dest(b, spaced[2].trim()), rest: spaced[2].trim() };
  }
  return { ...dest(b, ''), rest: '' };
}

function describePrimary(resolved, q) {
  if (resolved.local) {
    const L = resolved.local;
    if (L.kind === 'task') {
      const later = L.list === 'later';
      return {
        key: `cmd:task:${L.list}`, kind: 'command', tag: later ? 'TL' : 'T',
        name: `${later ? 'Later' : 'Task'}: ${short(L.text)}`,
        detail: later ? 'Park for Later' : 'Add to Today', local: L,
      };
    }
    if (L.kind === 'note') {
      return {
        key: 'cmd:note', kind: 'command', tag: 'N',
        name: `Note: ${short(L.text)}`, detail: 'Append to Notes', local: L,
      };
    }
    if (L.kind === 'timer') {
      return {
        key: 'cmd:timer', kind: 'command', tag: '▶',
        name: `Start ${L.minutes}m ${L.mode === 'short' ? 'break' : 'focus'}`,
        detail: 'Begin session', local: L,
      };
    }
    return {
      key: 'cmd:calc', kind: 'command', tag: '=',
      name: `= ${L.value}`, detail: 'Show result', local: L,
    };
  }
  if (resolved.bang) {
    const id = ((q.match(/^!?(\S+)/) || [])[1] || '').toLowerCase();
    const b = findBang(id);
    const tag = (b ? b.id : id).toUpperCase();
    return {
      key: `bang:${b ? b.id : id}`, kind: 'bang', tag,
      name: resolved.name, detail: 'Bang', url: resolved.url,
    };
  }
  const current = engine();
  return {
    key: `engine:${current.id}`, kind: 'engine', tag: '⌕',
    name: `Search ${current.name} for “${short(q)}”`,
    detail: 'Web search', url: resolved.url,
  };
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
  const local = parseLocalCommand(q);
  if (local) return local;

  const spaced = q.match(/^(\S+)\s+([\s\S]+)$/);
  if (spaced) {
    const bang = findBang(spaced[1]);
    if (bang && bang.bare) return dest(bang, spaced[2].trim());
  }

  return fallback;
}

export function mountSearch(root, { autofocus = true, onLocal = null } = {}) {
  root.innerHTML = `
    <form class="search" role="search">
      <input class="search-input" type="text" name="q" autocomplete="off"
             spellcheck="false" aria-label="Search the web" aria-expanded="false" aria-controls="search-suggest"
             title="t task · tl task for later · n note · timer 25 · 2+2 calculates" />
      <span class="search-engine"></span>
      <ul id="search-suggest" class="search-suggest" role="listbox" aria-label="Search suggestions" hidden></ul>
    </form>`;

  const form = root.querySelector('.search');
  const input = root.querySelector('.search-input');
  const label = root.querySelector('.search-engine');
  const list = root.querySelector('.search-suggest');

  let items = [];
  let sel = 0;

  const runItem = (item) => {
    if (!item) return;
    if (item.local) {
      // A 'keep' return leaves the field alone — the calc handler uses it to
      // show the answer where the expression was.
      const keep = onLocal ? onLocal(item.local, input) : undefined;
      if (keep !== 'keep') input.value = '';
      paint();
      return;
    }
    if (!item.url) return;
    // A new tab, so a running timer and any playing station survive the search.
    // A click or Enter is a user gesture, so popup blockers leave it alone.
    window.open(item.url, '_blank', 'noopener');
    // The page is still here afterwards, so clear the field rather than leaving
    // the last query sitting in it.
    input.value = '';
    paint();
  };

  const renderList = () => {
    list.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'sug' + (i === sel ? ' is-active' : '');
      li.setAttribute('role', 'option');
      li.id = `search-sug-${i}`;
      li.setAttribute('aria-selected', String(i === sel));
      const tag = document.createElement('span');
      tag.className = 'sug-tag';
      tag.textContent = item.tag;
      const name = document.createElement('span');
      name.className = 'sug-name';
      name.textContent = item.name;
      const detail = document.createElement('span');
      detail.className = 'sug-detail';
      detail.textContent = item.detail;
      li.append(tag, name, detail);
      // mousedown fires before blur, so the field keeps focus and the
      // global Escape-to-blur never sees this gesture.
      li.addEventListener('mousedown', (e) => { e.preventDefault(); runItem(item); });
      list.append(li);
    });
    const open = items.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open) input.setAttribute('aria-activedescendant', `search-sug-${sel}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const paint = () => {
    const resolved = resolveSearch(input.value);
    label.textContent = resolved.name;
    label.classList.toggle('is-bang', resolved.bang);
    input.placeholder = `Search ${engine().name}`;
    items = suggestSearch(input.value);
    sel = 0;
    renderList();
  };
  paint();

  input.addEventListener('input', paint);
  input.addEventListener('focus', paint);
  input.addEventListener('blur', () => { items = []; renderList(); });
  subscribe(paint);

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') return;
    if (e.key === 'Escape') {
      // First Escape closes the palette; the global handler blurs on the next.
      // Typing fields never reach the global shortcuts, so only stop the
      // event when there is actually something to close.
      if (items.length === 0) return;
      e.stopPropagation();
      e.preventDefault();
      items = [];
      renderList();
      return;
    }
    if (items.length === 0) return;
    e.preventDefault();
    sel = e.key === 'ArrowDown'
      ? (sel + 1) % items.length
      : (sel - 1 + items.length) % items.length;
    renderList();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Selection 0 mirrors resolveSearch, so plain Enter is unchanged.
    runItem(items[sel]);
  });

  if (autofocus) input.focus();
  return {
    focus: () => input.focus(),
    blur: () => input.blur(),
    paint,
  };
}
