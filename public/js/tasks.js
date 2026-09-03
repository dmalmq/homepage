// Task queue. Today is what the timer works through; Later is the pile.
// Click selects (today only), double-click edits. Midnight drops what's done
// and either carries the rest or parks it in Later, per settings.

import { state, commit, uid, subscribe } from './store.js';
import { nextTaskId } from './pomodoro.js';

let todayList = null;
let laterList = null;

export function mountTasks(root) {
  root.innerHTML = `
    <section class="task-section">
      <h3 class="task-heading">Today</h3>
      <ul class="task-list" data-list="today"></ul>
      <input class="task-input" data-list="today" type="text" maxlength="120"
             placeholder="Add a task" aria-label="Add a task" />
    </section>
    <section class="task-section">
      <h3 class="task-heading">Later</h3>
      <ul class="task-list" data-list="later"></ul>
      <input class="task-input" data-list="later" type="text" maxlength="120"
             placeholder="Park for later" aria-label="Park for later" />
    </section>`;

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

export function addTask(text, list = 'today') {
  const v = String(text || '').trim();
  if (!v) return;
  if (list === 'later') {
    if (!Array.isArray(state.later)) state.later = [];
    state.later.push({ id: uid(), text: v.slice(0, 120) });
  } else {
    const task = { id: uid(), text: v.slice(0, 120), done: false };
    state.tasks.push(task);
    if (!state.currentTaskId) state.currentTaskId = task.id;
  }
  commit();
}

function markDone(task, done) {
  if (!!task.done === done) return;
  task.done = done;
  state.doneToday = Math.max(0, (state.doneToday || 0) + (done ? 1 : -1));
  if (done && task.id === state.currentTaskId) state.currentTaskId = nextTaskId();
  commit();
}

function removeToday(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.currentTaskId === id) state.currentTaskId = nextTaskId();
  commit();
}

function removeLater(id) {
  state.later = state.later.filter(t => t.id !== id);
  commit();
}

function toLater(id) {
  const i = state.tasks.findIndex(t => t.id === id);
  if (i < 0) return;
  const [task] = state.tasks.splice(i, 1);
  if (!Array.isArray(state.later)) state.later = [];
  state.later.push({ id: task.id, text: task.text });
  if (state.currentTaskId === id) state.currentTaskId = nextTaskId();
  commit();
}

function toToday(id) {
  const i = (state.later || []).findIndex(t => t.id === id);
  if (i < 0) return;
  const [task] = state.later.splice(i, 1);
  state.tasks.push({ id: task.id, text: task.text, done: false });
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

  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'task-empty';
    empty.textContent = list === 'today'
      ? 'Add what you want to get through today.'
      : 'Nothing parked.';
    el.append(empty);
    return;
  }

  items.forEach((task, i) => {
    const li = document.createElement('li');
    li.className = 'task-item';
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
      text.title = 'Click to focus on this, double-click to rename';
      text.addEventListener('click', () => {
        if (text.isContentEditable) return;
        state.currentTaskId = task.id;
        commit();
      });
      text.addEventListener('dblclick', () => beginEdit(text, task, list));
    } else {
      text.title = 'Double-click to rename';
      text.addEventListener('dblclick', () => beginEdit(text, task, list));
    }
    li.append(text);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    if (list === 'today') {
      actions.append(
        actionButton('Move up', '↑', () => move(state.tasks, i, -1)),
        actionButton('Move down', '↓', () => move(state.tasks, i, 1)),
      );
      if (!task.done) actions.append(actionButton('Move to later', 'later', () => toLater(task.id)));
      actions.append(actionButton('Delete', '✕', () => removeToday(task.id)));
    } else {
      actions.append(
        actionButton('Move up', '↑', () => move(state.later, i, -1)),
        actionButton('Move down', '↓', () => move(state.later, i, 1)),
        actionButton('Move to today', 'today', () => toToday(task.id)),
        actionButton('Delete', '✕', () => removeLater(task.id)),
      );
    }
    li.append(actions);
    el.append(li);
  });
}

function actionButton(label, glyph, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = glyph;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
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
