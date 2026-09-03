// Quick notes. Typing writes to state on a short debounce and persists without
// re-rendering, so the caret is never disturbed mid-sentence.

import { state, save, subscribe } from './store.js';

export function mountNotes(root) {
  root.innerHTML = `
    <textarea class="notes-area" spellcheck="false"
              placeholder="Anything you don't want to hold in your head"
              aria-label="Notes"></textarea>`;

  const area = root.querySelector('.notes-area');

  area.value = state.notes || '';

  area.addEventListener('input', () => {
    state.notes = area.value;
    save();
  });

  // Only adopt a remote edit when the field isn't being typed into.
  subscribe(() => {
    if (document.activeElement === area) return;
    if (area.value !== (state.notes || '')) area.value = state.notes || '';
  });
}
