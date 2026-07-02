// @vitest-environment jsdom
//
// src/persistence/prefs.test.ts — the persisted maxSteps preference: localStorage round-trip
// (survives "reloads" — a fresh read of the same storage), precedence over garbage, and graceful
// no-op without storage.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { loadMaxSteps, saveMaxSteps, clearMaxSteps } from './prefs';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}
beforeAll(() => vi.stubGlobal('localStorage', memoryStorage()));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => clearMaxSteps());

describe('prefs: persistent maxSteps', () => {
  it('round-trips through storage (reload semantics: a later read sees the write)', () => {
    expect(loadMaxSteps()).toBeNull(); // absent → caller falls back to config default
    saveMaxSteps(10000);
    expect(loadMaxSteps()).toBe(10000);
    saveMaxSteps(250);
    expect(loadMaxSteps()).toBe(250); // last write wins
    clearMaxSteps();
    expect(loadMaxSteps()).toBeNull();
  });

  it('truncates fractional caps and refuses to persist garbage', () => {
    saveMaxSteps(1234.9);
    expect(loadMaxSteps()).toBe(1234);
    saveMaxSteps(NaN); // ignored — the stored value survives
    saveMaxSteps(-5);
    saveMaxSteps(0);
    expect(loadMaxSteps()).toBe(1234);
  });

  it('garbage IN storage reads as null (fallback to config default)', () => {
    localStorage.setItem('diagram-evolver:prefs:maxSteps', 'not-a-number');
    expect(loadMaxSteps()).toBeNull();
    localStorage.setItem('diagram-evolver:prefs:maxSteps', '0');
    expect(loadMaxSteps()).toBeNull(); // a cap below 1 is meaningless
  });
});
