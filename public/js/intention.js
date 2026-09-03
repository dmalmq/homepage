// One line for the day, sitting above the timer. Distinct from notes (a dump)
// and the current task (this session). Cleared at midnight by the day rollover.

import { state, save, commit, subscribe } from './store.js';

const PLACEHOLDER = "What's today for?";
const MAX = 80;

export function mountIntention(el) {
  const paint = () => {
    if (document.activeElement === el) return;
    const v = (state.intention || '').trim();
    el.classList.toggle('is-empty', !v);
    el.textContent = v || PLACEHOLDER;
    el.title = v ? 'Click to edit' : 'Set a line for the day';
  };

  const startEdit = () => {
    if (el.isContentEditable) return;
    el.classList.remove('is-empty');
    el.textContent = (state.intention || '').trim();
    beginEdit(el);
  };

  el.addEventListener('click', startEdit);
  el.addEventListener('keydown', (e) => {
    if (el.isContentEditable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      startEdit();
    }
  });

  paint();
  subscribe(paint);
}

function beginEdit(el) {
  el.setAttribute('contenteditable', 'plaintext-only');
  if (!el.isContentEditable) el.setAttribute('contenteditable', 'true');
  el.setAttribute('role', 'textbox');
  el.focus();

  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const onInput = () => {
    let v = el.textContent.replace(/\n/g, ' ');
    if (v.length > MAX) {
      v = v.slice(0, MAX);
      el.textContent = v;
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(end);
    }
    state.intention = v.trim();
    save();
  };

  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    el.blur();
  };

  const finish = () => {
    el.removeAttribute('contenteditable');
    el.setAttribute('role', 'button');
    el.removeEventListener('input', onInput);
    el.removeEventListener('keydown', onKey);
    state.intention = el.textContent.replace(/\n/g, ' ').trim().slice(0, MAX);
    commit();
  };

  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKey);
  el.addEventListener('blur', finish, { once: true });
}
