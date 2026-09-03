import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDayRollover } from '../public/js/store.js';
import { isSafeFavorite } from '../public/js/favorites.js';
import { toEmbed } from '../public/js/stations.js';

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
