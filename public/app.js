(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ---------- API client ----------
  const api = {
    async login(password) {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      let body = null;
      try { body = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, error: body && body.error };
    },
    async logout() {
      await fetch('/api/logout', { method: 'POST' });
    },
    async getState() {
      const r = await fetch('/api/state', { method: 'GET' });
      if (r.status === 401) return { authed: false };
      if (!r.ok) throw new Error('state get failed');
      const { state } = await r.json();
      return { authed: true, state: state || {} };
    },
    async putState(state) {
      const r = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      if (r.status === 401) return { authed: false };
      if (!r.ok) throw new Error('state put failed');
      const { state: stamped } = await r.json();
      return { authed: true, state: stamped };
    },
  };

  // ---------- Defaults & state model ----------
  const DEFAULTS = {
    durations: { pomodoro: 25, short: 5, long: 15, interval: 4 },
    bg: { type: 'preset', id: 'aurora' },
    bgImage: null,
    tasks: [],
    currentTaskId: null,
    notes: '',
    completedPomodoros: 0,
    sound: 'chime',
    updatedAt: 0,
  };

  let state = clone(DEFAULTS);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Runtime (per-device, not synced)
  let mode = 'pomodoro';
  let remaining = state.durations.pomodoro * 60;
  let total = remaining;
  let running = false;
  let endTime = 0;
  let tickHandle = null;

  // Sync bookkeeping
  let serverTs = 0;          // last server-known updatedAt
  let writeInFlight = false;
  let dirty = false;         // local change pending push
  let pushTimer = null;

  // ---------- Elements ----------
  const elApp = $('app');
  const elLoginOverlay = $('login-overlay');
  const elLoginForm = $('login-form');
  const elLoginPw = $('login-pw');
  const elLoginErr = $('login-err');

  const elTime = $('time-text');
  const elRing = $('ring-progress');
  const elStart = $('start-btn');
  const elReset = $('reset-btn');
  const elFs = $('fs-btn');
  const elModes = [...document.querySelectorAll('.mode-tab')];
  const elCurrentTask = $('current-task');
  const elCurrentTaskLabel = $('current-task-label');

  const elTasksPanel = $('tasks-panel');
  const elNotesPanel = $('notes-panel');
  const elTasksToggle = $('tasks-toggle');
  const elNotesToggle = $('notes-toggle');
  const elTaskInput = $('task-input');
  const elTaskList = $('task-list');
  const elNotesArea = $('notes-area');
  const elNotesStatus = $('notes-status');

  const elSettingsBtn = $('settings-btn');
  const elSettingsModal = $('settings-modal');
  const elSettingsClose = $('settings-close');
  const elSettingsSave = $('settings-save');
  const elLogoutBtn = $('logout-btn');
  const elDurPomodoro = $('dur-pomodoro');
  const elDurShort = $('dur-short');
  const elDurLong = $('dur-long');
  const elDurInterval = $('dur-interval');
  const elBgPresets = $('bg-presets');
  const elBgFile = $('bg-file');
  const elBgClear = $('bg-clear');
  const elBgHint = $('bg-hint');
  const elBgOverlay = $('bg-overlay');
  const elSoundSelect = $('sound-select');
  const elSoundPreview = $('sound-preview');

  // ---------- Background presets ----------
  const PRESETS = [
    { id: 'aurora',   name: 'Aurora',   css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)' },
    { id: 'sunset',   name: 'Sunset',   css: 'linear-gradient(135deg, #ff9a56 0%, #ff6a88 55%, #ff99ac 100%)' },
    { id: 'forest',   name: 'Forest',   css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
    { id: 'ocean',    name: 'Ocean',    css: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
    { id: 'ember',    name: 'Ember',    css: 'linear-gradient(135deg, #4a0f0f 0%, #d8341a 60%, #ffb347 100%)' },
    { id: 'midnight', name: 'Midnight', css: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
    { id: 'peach',    name: 'Peach',    css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
    { id: 'mono',     name: 'Graphite', css: 'linear-gradient(135deg, #1f1f1f 0%, #3a3a3a 100%)' },
  ];

  // ---------- Apply state to UI ----------
  function applyState(s) {
    state = Object.assign(clone(DEFAULTS), s || {});
    serverTs = state.updatedAt || 0;

    // durations / timer
    const m = mode === 'pomodoro' ? state.durations.pomodoro
            : mode === 'short' ? state.durations.short
            : state.durations.long;
    if (!running) { total = m * 60; remaining = total; }

    // notes
    elNotesArea.value = state.notes || '';

    // bg
    applyBackground();

    // tasks
    renderTasks();
    renderCurrentTask();
    renderTime();
  }

  function getSyncedState() {
    return {
      durations: state.durations,
      bg: state.bg,
      bgImage: state.bgImage,
      tasks: state.tasks,
      currentTaskId: state.currentTaskId,
      notes: state.notes,
      completedPomodoros: state.completedPomodoros,
      sound: state.sound,
      updatedAt: state.updatedAt,
    };
  }

  // ---------- Sync ----------
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushState, 800);
  }

  async function pushState() {
    if (writeInFlight) { dirty = true; return; }
    writeInFlight = true;
    const payload = getSyncedState();
    try {
      const res = await api.putState(payload);
      if (!res.authed) { showLogin(); return; }
      serverTs = (res.state && res.state.updatedAt) || serverTs;
      state.updatedAt = serverTs;
    } catch (e) {
      console.warn('push failed', e);
    } finally {
      writeInFlight = false;
      if (dirty) { dirty = false; schedulePush(); }
    }
  }

  async function pullState({ force = false } = {}) {
    if (writeInFlight && !force) return;
    try {
      const res = await api.getState();
      if (!res.authed) { showLogin(); return; }
      const remoteTs = (res.state && res.state.updatedAt) || 0;
      if (remoteTs > serverTs) {
        // Remote is newer — apply (last-write-wins).
        applyState(res.state);
      }
    } catch (e) {
      console.warn('pull failed', e);
    }
  }

  // ---------- Login flow ----------
  function showLogin() {
    running = false;
    clearInterval(tickHandle);
    tickHandle = null;
    elStart.textContent = 'Start';
    elApp.hidden = true;
    elLoginOverlay.hidden = false;
    elLoginErr.textContent = '';
    setTimeout(() => elLoginPw.focus(), 0);
  }

  async function tryAutoLogin() {
    try {
      const res = await api.getState();
      if (!res.authed) { showLogin(); return; }
      enterApp(res.state);
    } catch (e) {
      showLogin();
    }
  }

  function enterApp(remoteState) {
    applyState(remoteState || {});
    elLoginOverlay.hidden = true;
    elApp.hidden = false;
    elApp.classList.remove('loading');
  }

  elLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    elLoginErr.textContent = '';
    const pw = elLoginPw.value;
    elLoginPw.value = '';
    if (!pw) return;
    const res = await api.login(pw);
    if (!res.ok) {
      if (res.status === 500 || res.error === 'server-config') {
        elLoginErr.textContent = 'Server not configured — set APP_PASSWORD + APP_SECRET env vars and redeploy.';
      } else if (res.status === 401 || res.error === 'invalid') {
        elLoginErr.textContent = 'Wrong password.';
      } else if (res.status === 405) {
        elLoginErr.textContent = 'Login endpoint not reachable (405). Check the deployment.';
      } else {
        elLoginErr.textContent = `Login failed (HTTP ${res.status}).`;
      }
      return;
    }
    try {
      const res2 = await api.getState();
      if (!res2.authed) { elLoginErr.textContent = 'Session error.'; return; }
      enterApp(res2.state);
    } catch (e) {
      elLoginErr.textContent = 'Logged in, but the database is unreachable. Connect a Postgres database to the project (see /api/health).';
    }
  });

  elLogoutBtn.addEventListener('click', async () => {
    await api.logout();
    closeSettings();
    showLogin();
  });

  // ---------- Timer ----------
  function start() {
    if (running) { pause(); return; }
    running = true;
    endTime = Date.now() + remaining * 1000;
    elStart.textContent = 'Pause';
    tickHandle = setInterval(tick, 250);
    tick();
  }
  function pause() {
    running = false;
    clearInterval(tickHandle);
    tickHandle = null;
    elStart.textContent = 'Resume';
  }
  function tick() {
    remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    renderTime();
    if (remaining <= 0) complete();
  }
  function reset() {
    running = false;
    clearInterval(tickHandle);
    tickHandle = null;
    elStart.textContent = 'Start';
    const m = mode === 'pomodoro' ? state.durations.pomodoro
            : mode === 'short' ? state.durations.short
            : state.durations.long;
    total = m * 60;
    remaining = total;
    renderTime();
  }
  function complete() {
    running = false;
    clearInterval(tickHandle);
    tickHandle = null;
    elStart.textContent = 'Start';
    playSound();
    if (mode === 'pomodoro') {
      state.completedPomodoros = (state.completedPomodoros || 0) + 1;
      if (state.currentTaskId) {
        const t = state.tasks.find(x => x.id === state.currentTaskId);
        if (t) t.done = true;
        state.currentTaskId = pickNextTaskId();
        renderTasks();
        renderCurrentTask();
      }
      const next = state.completedPomodoros % state.durations.interval === 0 ? 'long' : 'short';
      setMode(next);
      schedulePush();
    } else {
      setMode('pomodoro');
    }
  }
  function pickNextTaskId() {
    const next = state.tasks.find(t => !t.done);
    return next ? next.id : null;
  }

  // ---------- Render helpers ----------
  function applyModeClass() {
    document.body.classList.remove('mode-pomodoro', 'mode-short', 'mode-long');
    document.body.classList.add('mode-' + mode);
  }
  const RING_CIRCUMFERENCE = 2 * Math.PI * 90;
  function setRing(p) {
    elRing.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - p);
  }
  function renderTime() {
    elTime.textContent = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
    setRing(remaining / total);
  }
  const pad = (n) => String(n).padStart(2, '0');

  function setMode(newMode, { resetTime = true } = {}) {
    mode = newMode;
    elModes.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    applyModeClass();
    if (resetTime) {
      const m = mode === 'pomodoro' ? state.durations.pomodoro
              : mode === 'short' ? state.durations.short
              : state.durations.long;
      total = m * 60;
      remaining = total;
      renderTime();
    }
  }

  // ---------- Sound ----------
  const SOUNDS = [
    { id: 'chime',    name: 'Chime' },
    { id: 'bell',     name: 'Temple bell' },
    { id: 'marimba',  name: 'Marimba' },
    { id: 'digital',  name: 'Digital beep' },
    { id: 'soft',     name: 'Soft tone' },
    { id: 'none',     name: 'None' },
  ];

  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function tone({ freq, type = 'sine', start, dur, gain = 0.2, glideTo }) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  const SYNTHS = {
    chime(t) {
      [880, 660, 880].forEach((f, i) => tone({ freq: f, type: 'sine', start: t + i * 0.18, dur: 0.16, gain: 0.18 }));
    },
    bell(t) {
      // Rich strike: fundamental + overtone, long exponential decay.
      tone({ freq: 392, type: 'triangle', start: t, dur: 1.4, gain: 0.22 });
      tone({ freq: 784, type: 'sine', start: t, dur: 1.2, gain: 0.10 });
      tone({ freq: 1176, type: 'sine', start: t, dur: 0.9, gain: 0.05 });
    },
    marimba(t) {
      [523, 659].forEach((f, i) => tone({ freq: f, type: 'sine', start: t + i * 0.12, dur: 0.18, gain: 0.20 }));
    },
    digital(t) {
      [880, 880, 1320].forEach((f, i) => tone({ freq: f, type: 'square', start: t + i * 0.13, dur: 0.08, gain: 0.12 }));
    },
    soft(t) {
      tone({ freq: 523, type: 'sine', start: t, dur: 0.6, gain: 0.18, glideTo: 392 });
    },
    none() {},
  };

  function playSound() {
    try {
      const c = ctx();
      if (!c) return;
      const id = state.sound || 'chime';
      const fn = SYNTHS[id] || SYNTHS.chime;
      fn(c.currentTime);
    } catch {}
  }

  // ---------- Tasks ----------
  function renderTasks() {
    elTaskList.innerHTML = '';
    state.tasks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'task-item'
        + (t.id === state.currentTaskId ? ' current' : '')
        + (t.done ? ' done' : '');
      li.dataset.id = t.id;

      const toggle = document.createElement('button');
      toggle.className = 'task-toggle' + (t.done ? ' done' : '');
      toggle.title = t.done ? 'Undone' : 'Mark done';
      toggle.textContent = t.done ? '\u2713' : '';
      toggle.addEventListener('click', () => {
        t.done = !t.done;
        if (t.id === state.currentTaskId && t.done) state.currentTaskId = pickNextTaskId();
        renderTasks();
        renderCurrentTask();
        schedulePush();
      });

      const text = document.createElement('span');
      text.className = 'task-text';
      text.textContent = t.text;
      text.title = 'Click to edit, double-click to set as current';
      text.addEventListener('dblclick', () => {
        state.currentTaskId = t.id;
        renderTasks();
        renderCurrentTask();
        schedulePush();
      });
      text.addEventListener('click', () => {
        text.setAttribute('contenteditable', 'true');
        text.focus();
        const range = document.createRange();
        range.selectNodeContents(text);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      text.addEventListener('blur', () => {
        text.removeAttribute('contenteditable');
        const v = text.textContent.trim();
        if (!v) {
          state.tasks = state.tasks.filter(x => x.id !== t.id);
          if (state.currentTaskId === t.id) state.currentTaskId = pickNextTaskId();
        } else {
          t.text = v.slice(0, 120);
        }
        renderTasks();
        renderCurrentTask();
        schedulePush();
      });
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); text.blur(); }
      });

      const actions = document.createElement('div');
      actions.className = 'task-actions';
      const up = document.createElement('button'); up.textContent = '\u2191'; up.title = 'Move up';
      up.addEventListener('click', () => { if (i > 0) { state.tasks.splice(i,1); state.tasks.splice(i-1,0,t); renderTasks(); schedulePush(); } });
      const down = document.createElement('button'); down.textContent = '\u2193'; down.title = 'Move down';
      down.addEventListener('click', () => { if (i < state.tasks.length-1) { state.tasks.splice(i,1); state.tasks.splice(i+1,0,t); renderTasks(); schedulePush(); } });
      const del = document.createElement('button'); del.textContent = '\u2715'; del.title = 'Delete';
      del.addEventListener('click', () => {
        state.tasks = state.tasks.filter(x => x.id !== t.id);
        if (state.currentTaskId === t.id) state.currentTaskId = pickNextTaskId();
        renderTasks();
        renderCurrentTask();
        schedulePush();
      });
      actions.append(up, down, del);

      li.append(toggle, text, actions);
      elTaskList.append(li);
    });
  }

  function addTask(text) {
    const v = text.trim();
    if (!v) return;
    const t = { id: uid(), text: v.slice(0, 120), done: false };
    state.tasks.push(t);
    if (!state.currentTaskId && !t.done) state.currentTaskId = t.id;
    renderTasks();
    renderCurrentTask();
    schedulePush();
  }

  function renderCurrentTask() {
    if (!state.currentTaskId) {
      elCurrentTask.hidden = false;
      elCurrentTaskLabel.textContent = 'No task selected';
      return;
    }
    const t = state.tasks.find(x => x.id === state.currentTaskId);
    if (!t) { state.currentTaskId = null; renderCurrentTask(); return; }
    elCurrentTask.hidden = false;
    elCurrentTaskLabel.textContent = '\u25B8 ' + t.text;
  }

  // ---------- Notes ----------
  let notesTimer = null;
  elNotesArea.addEventListener('input', () => {
    elNotesStatus.textContent = 'Saving...';
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      state.notes = elNotesArea.value;
      schedulePush();
      elNotesStatus.textContent = 'Saved';
    }, 500);
  });

  // ---------- Background ----------
  function applyBackground() {
    if (state.bg && state.bg.type === 'image' && state.bgImage) {
      elBgOverlay.style.background = `url("${state.bgImage}") center/cover no-repeat`;
    } else {
      const id = (state.bg && state.bg.id) || 'aurora';
      const preset = PRESETS.find(p => p.id === id) || PRESETS[0];
      elBgOverlay.style.background = preset.css;
    }
    renderBgPresets();
  }

  function renderBgPresets() {
    elBgPresets.innerHTML = '';
    PRESETS.forEach(p => {
      const sw = document.createElement('div');
      const selected = (!state.bg || state.bg.type !== 'image') && state.bg && state.bg.id === p.id;
      sw.className = 'bg-swatch' + (selected ? ' selected' : '');
      sw.style.background = p.css;
      sw.title = p.name;
      sw.addEventListener('click', () => {
        state.bg = { type: 'preset', id: p.id };
        state.bgImage = null;
        elBgHint.textContent = '';
        applyBackground();
        schedulePush();
      });
      elBgPresets.append(sw);
    });
  }

  elBgFile.addEventListener('change', () => {
    const file = elBgFile.files && elBgFile.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { elBgHint.textContent = 'Please choose an image file.'; return; }
    if (file.size > 2 * 1024 * 1024) {
      elBgHint.textContent = 'Image is over 2MB — please pick a smaller one (sync storage limit).';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.bgImage = reader.result;
      state.bg = { type: 'image' };
      applyBackground();
      schedulePush();
      elBgHint.textContent = '';
    };
    reader.onerror = () => { elBgHint.textContent = 'Could not read file.'; };
    reader.readAsDataURL(file);
  });

  elBgClear.addEventListener('click', () => {
    state.bg = { type: 'preset', id: 'aurora' };
    state.bgImage = null;
    elBgFile.value = '';
    elBgHint.textContent = '';
    applyBackground();
    schedulePush();
  });

  // ---------- Settings modal ----------
  function populateSoundSelect() {
    elSoundSelect.innerHTML = '';
    SOUNDS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      elSoundSelect.append(opt);
    });
  }
  function openSettings() {
    elDurPomodoro.value = state.durations.pomodoro;
    elDurShort.value = state.durations.short;
    elDurLong.value = state.durations.long;
    elDurInterval.value = state.durations.interval;
    elSoundSelect.value = state.sound || 'chime';
    elSettingsModal.hidden = false;
  }
  function closeSettings() { elSettingsModal.hidden = true; }
  elSettingsBtn.addEventListener('click', openSettings);
  elSettingsClose.addEventListener('click', closeSettings);
  elSettingsModal.addEventListener('click', (e) => { if (e.target === elSettingsModal) closeSettings(); });

  elSoundPreview.addEventListener('click', () => {
    state.sound = elSoundSelect.value;
    playSound();
  });

  elSettingsSave.addEventListener('click', () => {
    const clamp = (v, lo, hi, def) => {
      const n = parseInt(v, 10);
      if (isNaN(n)) return def;
      return Math.min(hi, Math.max(lo, n));
    };
    state.durations.pomodoro = clamp(elDurPomodoro.value, 1, 180, DEFAULTS.durations.pomodoro);
    state.durations.short    = clamp(elDurShort.value, 1, 60, DEFAULTS.durations.short);
    state.durations.long     = clamp(elDurLong.value, 1, 60, DEFAULTS.durations.long);
    state.durations.interval = clamp(elDurInterval.value, 2, 12, DEFAULTS.durations.interval);
    state.sound = elSoundSelect.value;
    if (!running) reset();
    schedulePush();
    closeSettings();
  });

  // ---------- Panels & controls ----------
  function togglePanel(panel, btn) {
    const open = !panel.hidden;
    elTasksPanel.hidden = true;
    elNotesPanel.hidden = true;
    elTasksToggle.classList.remove('active');
    elNotesToggle.classList.remove('active');
    if (!open) {
      panel.hidden = false;
      btn.classList.add('active');
    }
  }
  elTasksToggle.addEventListener('click', () => togglePanel(elTasksPanel, elTasksToggle));
  elNotesToggle.addEventListener('click', () => togglePanel(elNotesPanel, elNotesToggle));
  document.querySelectorAll('.panel-close').forEach(b => {
    b.addEventListener('click', () => {
      elTasksPanel.hidden = true;
      elNotesPanel.hidden = true;
      elTasksToggle.classList.remove('active');
      elNotesToggle.classList.remove('active');
    });
  });

  elStart.addEventListener('click', start);
  elReset.addEventListener('click', reset);
  elModes.forEach(b => b.addEventListener('click', () => {
    if (running) pause();
    setMode(b.dataset.mode);
  }));
  elFs.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });

  elTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTask(elTaskInput.value); elTaskInput.value = ''; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elSettingsModal.hidden) closeSettings();
  });

  // ---------- Cross-device sync on focus ----------
  let lastFocus = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && elLoginOverlay.hidden) pullState();
  });
  window.addEventListener('focus', () => {
    if (elLoginOverlay.hidden && Date.now() - lastFocus > 5000) pullState();
    lastFocus = Date.now();
  });
  // periodic refresh as a safety net
  setInterval(() => { if (elLoginOverlay.hidden) pullState(); }, 60000);

  // ---------- Init ----------
  applyModeClass();
  setMode('pomodoro');
  populateSoundSelect();
  renderTime();
  tryAutoLogin();
})();