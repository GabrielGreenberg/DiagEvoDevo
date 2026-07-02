// src/ui/store.ts
//
// A ~20-line observable store — the "tiny store" ARCHITECTURE.md calls for (no framework). It holds
// VIEW state (the current Session, editable seeds, run mode, the live maxSteps cap); the Session owns
// the heavy optimizer state. Panels subscribe and re-render on notify; the rAF loop bumps `tick`.

import type { SessionResult } from '../optim/session';
import type { SessionApi } from './sessionApi';

export type RunMode = 'idle' | 'running' | 'paused' | 'done';

export interface AppState {
  session: SessionApi;
  figureSeed: number;
  dataSeed: number;
  mode: RunMode;
  tick: number; // frame counter; bumping it forces a re-render
  /** STICKY selection: the stable trajectory id shown on the main canvas + score panel. Changes
   *  ONLY on a user thumbnail click (or session reset → first trajectory). Never auto-switches —
   *  not on overtake, not on finish, not on slot restart (spec: sticky selection). */
  selectedId: number;
  /** The live per-trajectory step cap (session.setMaxSteps). UI state so it PERSISTS across
   *  Reset / new-seed within this app instance (spec: maxSteps control). */
  maxSteps: number;
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
