// Task queue. Today is what the timer works through; Later is the pile.
// Click selects (today only), double-click edits. Midnight drops what's done
// and either carries the rest or parks it in Later, per settings.

import { state, commit, uid, subscribe } from './store.js';
import { nextTaskId } from './pomodoro.js';

let todayList = null;
let laterList = null;
let refocusId = null;
let pendingDelete = null;
let deleteTimer = null;

const DELETE_UNDO_MS = 8_000;

export function mountTasks(root) {
  root.innerHTML = `
    <section class="task-section">
      <h3 class="task-heading">Today</h3>
      <ul class="task-list" data-list="today"></ul>
      <input class="task-input" data-list="today" type="text" maxlength="120"
             placeholder="Draft report 2p" aria-label="Add a task" />
    </section>
    <section class="task-section">
      <h3 class="task-heading">Later</h3>
      <ul class="task-list" data-list="later"></ul>
      <input class="task-input" data-list="later" type="text" maxlength="120"
             placeholder="Park for later" aria-label="Park for later" />
    </section>
    <p class="task-hint">Choose a task to focus. Double-click to rename. Add 2p for sessions.</p>`;

  todayList = root.querySelector('[data-list="today"].task-list');
  laterList = root.querySelector('[data-list="later"].task-list');

  root.querySelectorAll('.task-input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addTask(input.value, input.dataset.list);
      input.value = '';
    });
  });

  renderTasks();
  subscribe(renderTasks);
}

/** A trailing `2p` sets the pomodoro estimate: `Draft report 2p` → 2 sessions. */
export function parseEstimate(raw) {
  const v = String(raw || '').trim();
  const m = v.match(/^(.*?)\s+(\d+)\s*p$/i);
  if (!m || !m[1].trim()) return { text: v.slice(0, 120), est: 0 };
  const est = Math.min(12, Math.max(1, parseInt(m[2], 10)));
  return { text: m[1].trim().slice(0, 120), est: Number.isNaN(est) ? 0 : est };
}

export function addTask(text, list = 'today') {
  const v = String(text || '').trim();
  if (!v) return;
  if (list === 'later') {
    if (!Array.isArray(state.later)) state.later = [];
    const { text: clean, est } = parseEstimate(v);
    state.later.push(est ? { id: uid(), text: clean, est } : { id: uid(), text: clean });
  } else {
    const { text: clean, est } = parseEstimate(v);
    const task = { id: uid(), text: clean, done: false };
    if (est) { task.est = est; task.spent = 0; }
    state.tasks.push(task);
    if (!state.currentTaskId) state.currentTaskId = task.id;
  }
  commit();
}

function markDone(task, done) {
  if (!!task.done === done) return;
  task.done = done;
  if (!done) task.spent = 0;
  state.doneToday = Math.max(0, (state.doneToday || 0) + (done ? 1 : -1));
  if (done && task.id === state.currentTaskId) state.currentTaskId = nextTaskId();
  commit();
}

function removeToday(id) {
  const i = state.tasks.findIndex(t => t.id === id);
  if (i < 0) return;
  const [task] = state.tasks.splice(i, 1);
  const wasCurrent = state.currentTaskId === id;
  if (wasCurrent) state.currentTaskId = nextTaskId();
  queueDelete(task, 'today', i, wasCurrent, state.currentTaskId);
  commit();
}

function removeLater(id) {
  const i = state.later.findIndex(t => t.id === id);
  if (i < 0) return;
  const [task] = state.later.splice(i, 1);
  queueDelete(task, 'later', i, false, state.currentTaskId);
  commit();
}

function queueDelete(task, list, index, wasCurrent, replacementId) {
  clearTimeout(deleteTimer);
  pendingDelete = { task, list, index, wasCurrent, replacementId };
  deleteTimer = setTimeout(() => {
    if (!pendingDelete || pendingDelete.task !== task) return;
    pendingDelete = null;
    deleteTimer = null;
    renderTasks();
  }, DELETE_UNDO_MS);
}

function undoDelete() {
  const deleted = pendingDelete;
  if (!deleted) return;
  const arr = deleted.list === 'later' ? state.later : state.tasks;
  if (arr.some(t => t.id === deleted.task.id)) return;
  clearTimeout(deleteTimer);
  pendingDelete = null;
  arr.splice(Math.min(deleted.index, arr.length), 0, deleted.task);
  if (deleted.wasCurrent && state.currentTaskId === deleted.replacementId) state.currentTaskId = deleted.task.id;
  commit();
}

function toLater(id) {
  const i = state.tasks.findIndex(t => t.id === id);
  if (i < 0) return;
  const [task] = state.tasks.splice(i, 1);
  if (!Array.isArray(state.later)) state.later = [];
  const parked = { id: task.id, text: task.text };
  if (task.est) { parked.est = task.est; parked.spent = task.spent || 0; }
  state.later.push(parked);
  if (state.currentTaskId === id) state.currentTaskId = nextTaskId();
  commit();
}

function toToday(id) {
  const i = (state.later || []).findIndex(t => t.id === id);
  if (i < 0) return;
  const [task] = state.later.splice(i, 1);
  const back = { id: task.id, text: task.text, done: false };
  if (task.est) { back.est = task.est; back.spent = task.spent || 0; }
  state.tasks.push(back);
  if (!state.currentTaskId) state.currentTaskId = task.id;
  commit();
}

function renderTasks() {
  if (!todayList || !laterList) return;
  paintList(todayList, state.tasks || [], 'today');
  paintList(laterList, state.later || [], 'later');
}

function paintList(el, items, list) {
  el.innerHTML = '';
  const undo = pendingDelete && pendingDelete.list === list
    ? undoRow(pendingDelete)
    : null;

  if (items.length === 0) {
    if (undo) el.append(undo);
    else {
      const empty = document.createElement('li');
      empty.className = 'task-empty';
      empty.textContent = list === 'today'
        ? 'Add what you want to get through today.'
        : 'Nothing parked yet.';
      el.append(empty);
    }
    return;
  }

  items.forEach((task, i) => {
    const li = document.createElement('li');
    li.className = 'task-item' + (list === 'later' ? ' task-item--later' : '');
    li.dataset.task = task.id;
    if (list === 'today') {
      li.classList.toggle('is-current', task.id === state.currentTaskId);
      li.classList.toggle('is-done', !!task.done);
    }

    if (list === 'today') {
      const toggle = document.createElement('button');
      toggle.className = 'task-toggle';
      toggle.setAttribute('aria-pressed', String(!!task.done));
      toggle.setAttribute('aria-label', task.done ? `Mark "${task.text}" not done` : `Mark "${task.text}" done`);
      toggle.addEventListener('click', () => markDone(task, !task.done));
      li.append(toggle);
    }

    const text = document.createElement('button');
    text.className = 'task-text';
    text.textContent = task.text;
    if (list === 'today') {
      text.title = task.text;
      text.addEventListener('click', () => {
        if (text.isContentEditable) return;
        state.currentTaskId = task.id;
        commit();
      });
      text.addEventListener('dblclick', () => beginEdit(text, task, list));
    } else {
      text.title = task.text;
      text.addEventListener('dblclick', () => beginEdit(text, task, list));
    }
    li.append(text);
    // Estimate badge, today only: sessions spent of those estimated. Click
    // cycles 1 → 2 → 3 → 4 → none so it stays one quiet control.
    if (list === 'today' && !task.done) {
      li.append(estButton(task));
    }

    li.append(...rowMenu(task, i, list, items.length));
    el.append(li);
  });

  if (undo) el.insertBefore(undo, el.children[Math.min(pendingDelete.index, el.children.length)] || null);

  // A menu action rebuilds the list, which would drop focus on the floor.
  if (refocusId) {
    const back = el.querySelector(`[data-task="${refocusId}"] .task-more`);
    if (back) { back.focus(); refocusId = null; }
  }
}

function undoRow(deleted) {
  const li = document.createElement('li');
  li.className = 'task-empty task-undo';
  const label = document.createElement('span');
  label.textContent = 'Task deleted.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-btn';
  button.textContent = 'Undo';
  button.setAttribute('aria-label', `Undo deleting "${deleted.task.text}"`);
  Object.assign(button.style, { margin: '0 0 0 8px', padding: '2px 4px', fontSize: 'inherit' });
  button.addEventListener('click', undoDelete);
  li.append(label, button);
  return li;
}
/** Estimate badge, today only: sessions spent of those estimated. Click
 * cycles 1 → 2 → 3 → 4 → none so it stays one quiet control. */
function estButton(task) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'task-est' + (task.est ? '' : ' is-off');
  const spent = Number(task.spent) || 0;
  b.textContent = task.est ? `${Math.min(spent, task.est)}/${task.est}p` : '+p';
  b.title = task.est
    ? `${spent} of ${task.est} sessions banked — click to change the estimate`
    : 'Estimate sessions — click to set';
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', () => {
    // none → 1 → 2 → 3 → 4 → none. Dropping the estimate keeps banked
    // sessions on the record but stops gating completion on them.
    const next = task.est ? (task.est >= 4 ? 0 : task.est + 1) : 1;
    if (next) { task.est = next; task.spent = Math.min(spent, next); }
    else { delete task.est; }
    commit();
  });
  return b;
}
function rowMenu(task, i, list, count) {
  const arr = list === 'later' ? state.later : state.tasks;

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'task-more';
  more.title = 'Task actions';
  more.setAttribute('aria-label', `Actions for "${task.text}"`);
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-haspopup', 'menu');
  more.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"'
    + ' stroke-width="2.5" stroke-linecap="round"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>';

  const menu = document.createElement('div');
  menu.className = 'task-menu';
  menu.popover = 'auto';
  menu.id = `task-menu-${task.id}`;
  more.setAttribute('popovertarget', menu.id);

  const item = (label, onClick, { danger = false, disabled = false } = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.disabled = disabled;
    if (danger) b.className = 'is-danger';
    b.addEventListener('click', () => {
      menu.hidePopover();
      // Deleting removes the row, so there is nothing to hand focus back to.
      refocusId = danger ? null : task.id;
      onClick();
    });
    return b;
  };

  menu.append(
    item('Move up', () => move(arr, i, -1), { disabled: i === 0 }),
    item('Move down', () => move(arr, i, 1), { disabled: i === count - 1 }),
    list === 'today'
      ? item('Move to Later', () => toLater(task.id), { disabled: !!task.done })
      : item('Move to Today', () => toToday(task.id)),
    divider(),
    item('Delete', () => (list === 'later' ? removeLater(task.id) : removeToday(task.id)), { danger: true }),
  );

  const firstEnabled = [...menu.querySelectorAll('button')].find(b => !b.disabled);
  if (firstEnabled) firstEnabled.autofocus = true;

  placeOnOpen(menu, more);
  return [more, menu];
}

function divider() {
  const hr = document.createElement('hr');
  hr.setAttribute('role', 'presentation');
  return hr;
}

/** Popovers live in the top layer, so they clear the panel's own overflow —
 *  but nothing positions them. Size is known from CSS, so this can run
 *  synchronously in beforetoggle and never paint at the wrong spot. */
function placeOnOpen(menu, anchor) {
  const W = 172, H = 150;
  menu.addEventListener('beforetoggle', (e) => {
    anchor.setAttribute('aria-expanded', String(e.newState === 'open'));
    if (e.newState !== 'open') return;
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - W, innerWidth - W - 8));
    const below = r.bottom + 6;
    const top = below + H > innerHeight - 8 ? Math.max(8, r.top - H - 6) : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  });

  // Arrow keys are what a menu is expected to answer to.
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % items.length
      : (at - 1 + items.length) % items.length;
    items[next].focus();
  });
}


function move(arr, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return;
  const [task] = arr.splice(index, 1);
  arr.splice(target, 0, task);
  commit();
}

function beginEdit(el, task, list) {
  el.setAttribute('contenteditable', 'plaintext-only');
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = () => {
    el.removeAttribute('contenteditable');
    const v = el.textContent.trim();
    if (!v) {
      if (list === 'later') removeLater(task.id);
      else removeToday(task.id);
    } else {
      task.text = v.slice(0, 120);
      commit();
    }
  };

  el.addEventListener('blur', finish, { once: true });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); el.blur(); }
  });
}
