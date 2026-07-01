// src/ui/store.ts
//
// A ~20-line observable store — the "tiny store" ARCHITECTURE.md calls for (no framework). It holds
// VIEW state (the current Session, editable seeds, run mode); the Session owns the heavy optimizer
// state. Panels subscribe and re-render on notify; the rAF loop bumps `tick` each frame.

import type { Session, SessionResult } from '../optim/session';

export type RunMode = 'idle' | 'running' | 'paused' | 'converged';

export interface AppState {
  session: Session;
  figureSeed: number;
  dataSeed: number;
  mode: RunMode;
  tick: number; // frame counter; bumping it forces a re-render
  loaded: SessionResult | null; // a loaded saved result being reviewed (overrides the live figure)
  saveCount: number;
}

export interface Store {
  get(): Readonly<AppState>;
  set(patch: Partial<AppState>): void;
  subscribe(fn: (s: Readonly<AppState>) => void): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<(s: Readonly<AppState>) => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
