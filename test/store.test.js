import test from 'node:test';
import assert from 'node:assert/strict';
import { state, replaceState, save, pushState, syncStatus } from '../public/js/store.js';

test('save snapshots a mutation locally before the network acknowledgement', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.fetch = async (_url, options) => ({
    ok: true,
    status: 200,
    async json() {
      const sent = JSON.parse(options.body).state;
      return { state: { ...sent, updatedAt: 1234 } };
    },
  });

  replaceState({ notes: '', updatedAt: 1000 });
  state.notes = 'survives a fast close';
  save();

  const pending = JSON.parse(values.get('homepage.state-cache.v1'));
  assert.equal(pending.state.notes, 'survives a fast close');
  assert.equal(pending.dirty, true);

  await pushState();
  const saved = JSON.parse(values.get('homepage.state-cache.v1'));
  assert.equal(saved.dirty, false);
  assert.equal(saved.state.updatedAt, 1234);
  assert.equal(syncStatus.phase, 'synced');
});
