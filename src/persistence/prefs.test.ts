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
  loadMatchBonus,
  saveMatchBonus,
  clearMatchBonus,
  loadCoincidence,
  saveCoincidence,
  clearCoincidence,
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
  clearMatchBonus();
  clearCoincidence();
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

describe('prefs: persistent reinforcement controls (matchBonus / coincidence)', () => {
  const COIN_KEY = 'diagram-evolver:prefs:coincidence';

  it('matchBonus round-trips BOTH boolean values exactly (reload semantics)', () => {
    expect(loadMatchBonus()).toBeNull(); // absent → caller falls back to config default
    saveMatchBonus(false); // false is a REAL stored state, never confused with absence
    expect(loadMatchBonus()).toBe(false);
    saveMatchBonus(true);
    expect(loadMatchBonus()).toBe(true); // last write wins
    clearMatchBonus();
    expect(loadMatchBonus()).toBeNull();
  });

  it('coincidence round-trips ALL THREE settings exactly (reload semantics)', () => {
    expect(loadCoincidence()).toBeNull(); // absent → caller falls back to config default
    for (const mode of ['off', 'weak', 'strong'] as const) {
      saveCoincidence(mode); // each setting is a REAL stored state, never confused with absence
      expect(loadCoincidence()).toBe(mode);
    }
    saveCoincidence('weak');
    expect(loadCoincidence()).toBe('weak'); // last write wins
    clearCoincidence();
    expect(loadCoincidence()).toBeNull();
  });

  it('MIGRATES the legacy boolean pref: stored "true" reads as weak, "false" as off', () => {
    // Through v2.2 the pref was a boolean and 'on' meant the weak formula — the only mode then.
    localStorage.setItem(COIN_KEY, 'true');
    expect(loadCoincidence()).toBe('weak');
    localStorage.setItem(COIN_KEY, 'false');
    expect(loadCoincidence()).toBe('off');
    // a save in the new scheme overwrites the legacy serialization for good
    saveCoincidence('strong');
    expect(localStorage.getItem(COIN_KEY)).toBe('strong');
    expect(loadCoincidence()).toBe('strong');
  });

  it('refuses to persist garbage: non-setting values leave the store untouched', () => {
    saveMatchBonus(false);
    saveCoincidence('strong');
    saveMatchBonus('yes' as unknown as boolean);
    saveMatchBonus(1 as unknown as boolean);
    saveCoincidence('sorta' as never); // not a setting
    saveCoincidence('OFF' as never); // case matters: only the canonical serialization counts
    saveCoincidence(true as never); // the OLD boolean API shape must not sneak back in
    saveCoincidence(null as never);
    expect(loadMatchBonus()).toBe(false);
    expect(loadCoincidence()).toBe('strong');
  });

  it('garbage IN storage reads as null (fallback to config default)', () => {
    localStorage.setItem('diagram-evolver:prefs:matchBonus', 'TRUE'); // only canonical counts
    expect(loadMatchBonus()).toBeNull();
    localStorage.setItem('diagram-evolver:prefs:matchBonus', '1');
    expect(loadMatchBonus()).toBeNull();
    for (const junk of ['TRUE', '1', 'Strong', 'WEAK', 'medium', 'not-a-mode', '']) {
      localStorage.setItem(COIN_KEY, junk);
      expect(loadCoincidence()).toBeNull();
    }
  });

  it('the two controls are independent of each other AND of the other preferences', () => {
    saveMatchBonus(false);
    saveCoincidence('off');
    saveMaxSteps(777);
    clearMatchBonus();
    expect(loadCoincidence()).toBe('off'); // clearing one never clobbers the other
    expect(loadMatchBonus()).toBeNull();
    clearCoincidence();
    expect(loadMaxSteps()).toBe(777); // …and the unrelated prefs survive both
  });
});
