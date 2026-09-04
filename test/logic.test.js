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

