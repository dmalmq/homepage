// Task queue. The pre-split version bound both click (edit) and dblclick (set
// current) to the task text, so click always won and setting a current task was
// unreachable. Split them: click selects, double-click edits.

import { state, commit, uid, subscribe } from './store.js';
import { nextTaskId } from './pomodoro.js';

let listEl = null;
let inputEl = null;

export function mountTasks(root) {
  root.innerHTML = `
    <ul class="task-list"></ul>
    <input class="task-input" type="text" maxlength="120"
           placeholder="Add a task" aria-label="Add a task" />`;

  listEl = root.querySelector('.task-list');
  inputEl = root.querySelector('.task-input');

  inputEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTask(inputEl.value);
    inputEl.value = '';
  });

  renderTasks();
  subscribe(renderTasks);
}

export function addTask(text) {
  const v = String(text || '').trim();
  if (!v) return;
  const task = { id: uid(), text: v.slice(0, 120), done: false };
  state.tasks.push(task);
  if (!state.currentTaskId) state.currentTaskId = task.id;
  commit();
}

function removeTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.currentTaskId === id) state.currentTaskId = nextTaskId();
  commit();
}

function renderTasks() {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (state.tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'task-empty';
    empty.textContent = 'Add what you want to get through today.';
    listEl.append(empty);
    return;
  }

  state.tasks.forEach((task, i) => {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.classList.toggle('is-current', task.id === state.currentTaskId);
    li.classList.toggle('is-done', !!task.done);

    const toggle = document.createElement('button');
    toggle.className = 'task-toggle';
    toggle.setAttribute('aria-pressed', String(!!task.done));
    toggle.setAttribute('aria-label', task.done ? `Mark "${task.text}" not done` : `Mark "${task.text}" done`);
    toggle.addEventListener('click', () => {
      task.done = !task.done;
      if (task.done && task.id === state.currentTaskId) state.currentTaskId = nextTaskId();
      commit();
    });

    const text = document.createElement('button');
    text.className = 'task-text';
    text.textContent = task.text;
    text.title = 'Click to focus on this, double-click to rename';
    text.addEventListener('click', () => {
      if (text.isContentEditable) return;
      state.currentTaskId = task.id;
      commit();
    });
    text.addEventListener('dblclick', () => beginEdit(text, task));

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    actions.append(
      actionButton('Move up', '↑', () => move(i, -1)),
      actionButton('Move down', '↓', () => move(i, 1)),
      actionButton('Delete', '✕', () => removeTask(task.id)),
    );

    li.append(toggle, text, actions);
    listEl.append(li);
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

function move(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.tasks.length) return;
  const [task] = state.tasks.splice(index, 1);
  state.tasks.splice(target, 0, task);
  commit();
}

function beginEdit(el, task) {
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
    if (!v) removeTask(task.id);
    else { task.text = v.slice(0, 120); commit(); }
  };

  el.addEventListener('blur', finish, { once: true });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); el.blur(); }
  });
}
