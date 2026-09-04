// Shortcuts fire only when you're not typing. Search still takes focus on
// load, so the common case stays "open a tab and type a query." Escape blurs
// the field (or closes a panel); after that, the keys below are live.

import { start, timer } from './pomodoro.js';
import { openFavorite } from './favorites.js';
import { getStage, setStage } from './stage.js';
import { stop as stopMusic } from './stations.js';

export const SHORTCUTS = [
  ['space', 'Start or pause a session'],
  ['h', 'Home'],
  ['p', 'Pomodoro'],
  ['s', 'Stop music'],
  ['1–8', 'Open a favorite'],
  ['t', 'Tasks'],
  ['n', 'Notes'],
  ['l', 'Listen'],
  ['r', 'Today'],
  ['/', 'Search'],
  ['?', 'This list'],
  ['esc', 'Close'],
];

export function keysMarkup() {
  return SHORTCUTS.map(([key, label]) =>
    `<div><kbd>${key}</kbd><span>${label}</span></div>`).join('');
}

export function wireKeys({
  isApp,
  isBlocked,
  showPanel,
  hidePanel,
  getOpenPanel,
  focusSearch,
  blurSearch,
}) {
  // A real <dialog>, so focus moves in on open, returns to where it was on
  // close, and the page behind it goes inert — none of which a div with
  // role="dialog" was doing. The element carries the label now.
  const root = document.getElementById('keys');
  root.innerHTML = `
    <div class="keys-card">
      <div class="keys-list">${keysMarkup()}</div>
    </div>`;

  const hideKeys = () => { if (root.open) root.close(); };
  const showKeys = () => { if (!root.open) root.showModal(); };
  const keysOpen = () => root.open;
  const dock = document.querySelector('.dock--left');
  if (dock && !document.getElementById('keys-open')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'keys-open';
    button.className = 'dock-btn';
    button.textContent = '?';
    button.title = 'Keyboard shortcuts (?)';
    button.setAttribute('aria-label', 'Keyboard shortcuts');
    button.setAttribute('aria-keyshortcuts', '?');
    button.addEventListener('click', showKeys);
    dock.append(button);
  }

  root.addEventListener('click', (e) => {
    if (e.target === root) hideKeys();
  });

  document.addEventListener('keydown', (e) => {
    if (!isApp()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isBlocked && isBlocked()) return;

    if (e.key === 'Escape') {
      if (keysOpen()) { hideKeys(); return; }
      if (isEditable(e.target)) {
        e.target.blur();
        return;
      }
      if (getOpenPanel()) { hidePanel(); return; }
      blurSearch();
      return;
    }

    if (keysOpen()) {
      if (e.key === '?') { e.preventDefault(); hideKeys(); }
      return;
    }

    if (isEditable(e.target)) return;

    if (e.key === '?') {
      e.preventDefault();
      if (keysOpen()) hideKeys();
      else showKeys();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      hideKeys();
      setStage('start');
      focusSearch();
      return;
    }

    if (e.key === 'h') {
      e.preventDefault();
      hideKeys();
      setStage('start');
      return;
    }

    if (e.key === 'p') {
      e.preventDefault();
      hideKeys();
      setStage('pomodoro');
      return;
    }

    if (e.key === 's') {
      e.preventDefault();
      hideKeys();
      stopMusic();
      return;
    }

    if (e.key === ' ') {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
      e.preventDefault();
      hideKeys();
      if (getStage() !== 'pomodoro') {
        setStage('pomodoro');
        if (!timer.running) start();
        return;
      }
      start();
      return;
    }

    if (e.key >= '1' && e.key <= '8') {
      e.preventDefault();
      openFavorite(Number(e.key) - 1);
      return;
    }

    const panelFor = { t: 'tasks', n: 'notes', l: 'listen', r: 'recap' }[e.key];
    if (panelFor) {
      e.preventDefault();
      hideKeys();
      showPanel(panelFor);
    }
  });
}

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}
