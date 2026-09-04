import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDayRollover } from '../public/js/store.js';
import { isSafeFavorite } from '../public/js/favorites.js';
import { toEmbed } from '../public/js/stations.js';
import { formatTime } from '../public/js/youtube.js';

test('day rollover parks unfinished tasks when carry is off', () => {
  const state = {
    taskDay: '2026-09-02', carryTasks: false, intention: 'Ship it', doneToday: 2,
    currentTaskId: 'a', later: [], tasks: [
      { id: 'a', text: 'Open', done: false },
      { id: 'b', text: 'Done', done: true },
    ],
  };
  assert.equal(applyDayRollover(state, '2026-09-03'), true);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.later, [{ id: 'a', text: 'Open' }]);
  assert.equal(state.currentTaskId, null);
  assert.equal(state.intention, '');
});

test('favorites allow only navigable HTTP(S) addresses', () => {
  assert.equal(isSafeFavorite({ url: 'example.com' }), true);
  assert.equal(isSafeFavorite({ url: 'https://example.com/path' }), true);
  assert.equal(isSafeFavorite({ url: 'javascript://alert(1)' }), false);
  assert.equal(isSafeFavorite({ url: '' }), false);
});

test('station parser accepts supported links and rejects unrelated URLs', () => {
  assert.equal(toEmbed('https://open.spotify.com/track/abc123')?.kind, 'spotify');
  assert.equal(toEmbed('https://youtu.be/dQw4w9WgXcQ')?.kind, 'youtube');
  assert.equal(toEmbed('https://example.com/video'), null);
});

test('station parser correctly extracts YouTube video and playlist IDs', () => {
  const single = toEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(single?.kind, 'youtube');
  assert.equal(single?.videoId, 'dQw4w9WgXcQ');
  assert.equal(single?.listId, null);

  const playlist = toEmbed('https://www.youtube.com/playlist?list=PL1234567890abcdef');
  assert.equal(playlist?.kind, 'youtube');
  assert.equal(playlist?.videoId, null);
  assert.equal(playlist?.listId, 'PL1234567890abcdef');

  const videoInList = toEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcdef');
  assert.equal(videoInList?.kind, 'youtube');
  assert.equal(videoInList?.videoId, 'dQw4w9WgXcQ');
  assert.equal(videoInList?.listId, 'PL1234567890abcdef');
});

test('formatTime correctly formats seconds to clock strings', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(45), '0:45');
  assert.equal(formatTime(75), '1:15');
  assert.equal(formatTime(3600), '1:00:00');
  assert.equal(formatTime(3665), '1:01:05');
  assert.equal(formatTime(-10), '0:00');
  assert.equal(formatTime(NaN), '0:00');
});


test('search commands resolve locally without a URL', async () => {
  const { resolveSearch } = await import('../public/js/search.js');
  const task = resolveSearch('t Buy milk');
  assert.equal(task.local?.kind, 'task');
  assert.equal(task.local?.list, 'today');
  assert.equal(task.local?.text, 'Buy milk');
  assert.equal(task.url, null);

  assert.equal(resolveSearch('tl Read later').local?.list, 'later');
  assert.equal(resolveSearch('later Read later').local?.list, 'later');
  assert.equal(resolveSearch('n Remember this').local?.kind, 'note');

  const timer = resolveSearch('timer 25');
  assert.equal(timer.local?.kind, 'timer');
  assert.equal(timer.local?.minutes, 25);
  assert.equal(timer.local?.mode, 'pomodoro');
  assert.equal(resolveSearch('break 5').local?.mode, 'short');

  // Bare `t` with no text stays a web search.
  assert.equal(resolveSearch('t').local, undefined);
});

test('search calculator answers inline and leaves plain text alone', async () => {
  const { tryEvaluateMath, resolveSearch } = await import('../public/js/search.js');
  assert.equal(tryEvaluateMath('2+2'), '4');
  assert.equal(tryEvaluateMath('(2+3)*4'), '20');
  assert.equal(tryEvaluateMath('10/4'), '2.5');
  assert.equal(tryEvaluateMath('75'), null);
  assert.equal(tryEvaluateMath('hello'), null);
  assert.equal(tryEvaluateMath('2+'), null);
  assert.equal(tryEvaluateMath('(2+3'), null);
  assert.equal(tryEvaluateMath('10//2'), null);
  assert.equal(resolveSearch('2+2').local?.kind, 'calc');
  assert.equal(resolveSearch('so tired').local, undefined);
  assert.equal(resolveSearch('w stockholm').bang, true);
});

test('task estimates parse from a trailing Np', async () => {
  const { parseEstimate } = await import('../public/js/tasks.js');
  assert.deepEqual(parseEstimate('Draft report 2p'), { text: 'Draft report', est: 2 });
  assert.deepEqual(parseEstimate('Just a task'), { text: 'Just a task', est: 0 });
  assert.deepEqual(parseEstimate('2p'), { text: '2p', est: 0 });
});

test('recap stats count streaks across a quiet today', async () => {
  const { recapStats } = await import('../public/js/recap.js');
  const day = 86_400_000;
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const t = noon.getTime();
  const sessions = [
    { t: t - day, minutes: 25 },
    { t: t - day, minutes: 25 },
    { t: t - 2 * day, minutes: 25 },
    { t: t - 3 * day, minutes: 25 },
  ];
  const stats = recapStats(sessions, t);
  assert.equal(stats.todayCount, 0);
  assert.equal(stats.streak, 3);
  assert.equal(stats.weekCount, 4);
  assert.equal(stats.weekMinutes, 100);
  assert.equal(stats.best?.count, 2);
});

test('day rollover carries estimates when parking tasks', () => {
  const parked = {
    taskDay: '2026-09-02', carryTasks: false, intention: '', doneToday: 0,
    currentTaskId: 'a', later: [],
    tasks: [{ id: 'a', text: 'Big one', done: false, est: 3, spent: 1 }],
  };
  assert.equal(applyDayRollover(parked, '2026-09-03'), true);
  assert.deepEqual(parked.later, [{ id: 'a', text: 'Big one', est: 3, spent: 1 }]);
});

test('recap week survives a DST transition', async () => {
  const { recapStats, lastSevenMidnights } = await import('../public/js/recap.js');
  const prevTZ = process.env.TZ;
  process.env.TZ = 'Europe/Stockholm';
  try {
    // Fall back: 2026-10-25 is 25 hours long, so fixed 24h subtraction both
    // drops the oldest day from the window and misses the streak lookup.
    const now = new Date(2026, 9, 26, 12, 0, 0).getTime();
    const keys = lastSevenMidnights(now);
    assert.equal(keys.length, 7);
    assert.equal(new Set(keys).size, 7);
    for (let i = 1; i < keys.length; i++) {
      const next = new Date(keys[i - 1]);
      next.setDate(next.getDate() + 1);
      const b = new Date(keys[i]);
      assert.equal(b.getFullYear(), next.getFullYear());
      assert.equal(b.getMonth(), next.getMonth());
      assert.equal(b.getDate(), next.getDate());
    }
    const sessions = keys.map(k => ({ t: k + 12 * 3_600_000, minutes: 25 }));
    const stats = recapStats(sessions, now);
    assert.equal(stats.weekCount, 7);
    assert.equal(stats.weekMinutes, 175);
    assert.equal(stats.streak, 7);
  } finally {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  }
});

test('search suggestions rank the Enter behavior first', async () => {
  const { suggestSearch } = await import('../public/js/search.js');
  assert.deepEqual(suggestSearch(''), []);
  assert.deepEqual(suggestSearch('   '), []);

  const task = suggestSearch('t Buy milk');
  assert.equal(task[0].kind, 'command');
  assert.equal(task[0].local?.list, 'today');
  assert.ok(task.some(i => i.kind === 'engine'));

  const yt = suggestSearch('yt lo-fi');
  assert.equal(yt[0].kind, 'bang');
  assert.ok(yt[0].url?.includes('youtube.com'));

  // `g` is not a bare bang, so Enter stays a web search — but both
  // g-bangs sit one arrow-press away as explicit picks.
  const g = suggestSearch('g foo');
  assert.equal(g[0].kind, 'engine');
  assert.ok(g.some(i => i.kind === 'bang'));

  const plain = suggestSearch('hello world');
  assert.equal(plain.length, 1);
  assert.equal(plain[0].kind, 'engine');

  const calc = suggestSearch('2+2');
  assert.equal(calc[0].kind, 'command');
  assert.equal(calc[0].local?.value, '4');
});
