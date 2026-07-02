// @vitest-environment jsdom
//
// src/persistence/prefs.test.ts — the persisted maxSteps and plateauRelEps preferences:
// localStorage round-trip (survives "reloads" — a fresh read of the same storage), precedence over
// garbage, and graceful no-op without storage.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  loadMaxSteps,
  saveMaxSteps,
  clearMaxSteps,
  loadPlateauRelEps,
  savePlateauRelEps,
  clearPlateauRelEps,
  loadDisabledCarriers,
  saveDisabledCarriers,
  clearDisabledCarriers,
} from './prefs';

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
beforeEach(() => {
  clearMaxSteps();
  clearPlateauRelEps();
  clearDisabledCarriers();
});

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

describe('prefs: persistent plateauRelEps (convergence strictness)', () => {
  it('round-trips scientific and decimal values EXACTLY (reload semantics)', () => {
    expect(loadPlateauRelEps()).toBeNull(); // absent → caller falls back to config default
    savePlateauRelEps(3e-4);
    expect(loadPlateauRelEps()).toBe(3e-4);
    savePlateauRelEps(0.0003);
    expect(loadPlateauRelEps()).toBe(0.0003);
    savePlateauRelEps(1e-7); // very strict — tiny values must survive without rounding to 0
    expect(loadPlateauRelEps()).toBe(1e-7);
    clearPlateauRelEps();
    expect(loadPlateauRelEps()).toBeNull();
  });

  it('is independent of the maxSteps preference (separate keys)', () => {
    saveMaxSteps(777);
    savePlateauRelEps(1e-5);
    clearMaxSteps();
    expect(loadPlateauRelEps()).toBe(1e-5); // clearing one never clobbers the other
    expect(loadMaxSteps()).toBeNull();
  });

  it('refuses to persist garbage: zero, negatives, NaN, Infinity all leave the store untouched', () => {
    savePlateauRelEps(2e-4);
    savePlateauRelEps(0);
    savePlateauRelEps(-1e-4);
    savePlateauRelEps(NaN);
    savePlateauRelEps(Infinity);
    expect(loadPlateauRelEps()).toBe(2e-4);
  });

  it('garbage IN storage reads as null (fallback to config default)', () => {
    localStorage.setItem('diagram-evolver:prefs:plateauRelEps', 'not-a-number');
    expect(loadPlateauRelEps()).toBeNull();
    localStorage.setItem('diagram-evolver:prefs:plateauRelEps', '0');
    expect(loadPlateauRelEps()).toBeNull(); // a non-positive threshold is meaningless
    localStorage.setItem('diagram-evolver:prefs:plateauRelEps', '-3e-4');
    expect(loadPlateauRelEps()).toBeNull();
  });
});

describe('prefs: persistent disabledCarriers (readings toggles)', () => {
  it('round-trips a set of ids EXACTLY, including the empty set (reload semantics)', () => {
    expect(loadDisabledCarriers()).toBeNull(); // absent → caller falls back to config default
    saveDisabledCarriers(['page.displacement.magnitude', 'frame.midpoint.angle']);
    expect(loadDisabledCarriers()).toEqual(['page.displacement.magnitude', 'frame.midpoint.angle']);
    saveDisabledCarriers([]); // explicitly "everything on" is a VALID stored state, not absence
    expect(loadDisabledCarriers()).toEqual([]);
    clearDisabledCarriers();
    expect(loadDisabledCarriers()).toBeNull();
  });

  it('dedupes on save (a double-toggled id is stored once)', () => {
    saveDisabledCarriers(['a.b.c', 'a.b.c', 'x.y.z']);
    expect(loadDisabledCarriers()).toEqual(['a.b.c', 'x.y.z']);
  });

  it('refuses to persist garbage: non-arrays and non-string members leave the store untouched', () => {
    saveDisabledCarriers(['page.displacement.angle']);
    saveDisabledCarriers([1, 'x'] as unknown as string[]);
    saveDisabledCarriers('nope' as unknown as string[]);
    expect(loadDisabledCarriers()).toEqual(['page.displacement.angle']);
  });

  it('garbage IN storage reads as null (fallback to config default)', () => {
    const KEY = 'diagram-evolver:prefs:disabledCarriers';
    localStorage.setItem(KEY, 'not-json{');
    expect(loadDisabledCarriers()).toBeNull();
    localStorage.setItem(KEY, '{"a":1}'); // valid JSON, wrong shape
    expect(loadDisabledCarriers()).toBeNull();
    localStorage.setItem(KEY, '["ok", 7]'); // array with a non-string member
    expect(loadDisabledCarriers()).toBeNull();
    localStorage.setItem(KEY, '["ok","ok","dup"]'); // stored duplicates read back deduped
    expect(loadDisabledCarriers()).toEqual(['ok', 'dup']);
  });

  it('is independent of the other preferences (separate keys)', () => {
    saveMaxSteps(777);
    saveDisabledCarriers(['a.b.c']);
    clearMaxSteps();
    expect(loadDisabledCarriers()).toEqual(['a.b.c']);
    clearDisabledCarriers();
    expect(loadMaxSteps()).toBeNull();
  });
});
