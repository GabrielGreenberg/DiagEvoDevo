// src/ui/store.test.ts — the tiny observable store.

import { describe, it, expect } from 'vitest';
import { createStore, type AppState } from './store';
import { createSession } from '../optim/session';

const initial = (): AppState => ({
  session: createSession(1, 1),
  figureSeed: 1,
  dataSeed: 1,
  mode: 'idle',
  tick: 0,
  loaded: null,
  saveCount: 0,
});

describe('store', () => {
  it('set merges and notifies subscribers', () => {
    const store = createStore(initial());
    let seen = 0;
    let lastMode = '';
    store.subscribe((s) => {
      seen++;
      lastMode = s.mode;
    });
    store.set({ mode: 'running' });
    expect(seen).toBe(1);
    expect(lastMode).toBe('running');
    expect(store.get().figureSeed).toBe(1); // unchanged fields preserved
  });

  it('unsubscribe stops notifications', () => {
    const store = createStore(initial());
    let seen = 0;
    const off = store.subscribe(() => seen++);
    store.set({ tick: 1 });
    off();
    store.set({ tick: 2 });
    expect(seen).toBe(1);
  });
});
