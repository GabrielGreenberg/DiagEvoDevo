// src/core/scale.test.ts — M2 gate for the scale lattice + commensurability.

import { describe, it, expect } from 'vitest';
import { ScaleType, ALL_SCALE_TYPES, scaleLeq, commensurability } from './scale';

const { Ordinal, Interval, Ratio, Cyclic } = ScaleType;

describe('scale: reads-down partial order (4×4 truth table)', () => {
  const expected: Record<string, Record<string, boolean>> = {
    ordinal: { ordinal: true, interval: true, ratio: true, cyclic: false },
    interval: { ordinal: false, interval: true, ratio: true, cyclic: false },
    ratio: { ordinal: false, interval: false, ratio: true, cyclic: false },
    cyclic: { ordinal: false, interval: false, ratio: false, cyclic: true },
  };
  it('matches the Hasse diagram exactly', () => {
    for (const a of ALL_SCALE_TYPES) {
      for (const b of ALL_SCALE_TYPES) {
        expect(scaleLeq(a, b), `${a} ≤ ${b}`).toBe(expected[a]![b]!);
      }
    }
  });
});

describe('scale: partial-order axioms', () => {
  it('is reflexive', () => {
    for (const a of ALL_SCALE_TYPES) expect(scaleLeq(a, a)).toBe(true);
  });
  it('is antisymmetric', () => {
    for (const a of ALL_SCALE_TYPES) {
      for (const b of ALL_SCALE_TYPES) {
        if (a !== b && scaleLeq(a, b)) expect(scaleLeq(b, a)).toBe(false);
      }
    }
  });
  it('is transitive', () => {
    for (const a of ALL_SCALE_TYPES) {
      for (const b of ALL_SCALE_TYPES) {
        for (const c of ALL_SCALE_TYPES) {
          if (scaleLeq(a, b) && scaleLeq(b, c)) expect(scaleLeq(a, c)).toBe(true);
        }
      }
    }
  });
  it('cyclic is isolated (incomparable to the linear chain both ways)', () => {
    for (const t of [Ordinal, Interval, Ratio]) {
      expect(scaleLeq(t, Cyclic)).toBe(false);
      expect(scaleLeq(Cyclic, t)).toBe(false);
    }
  });
});

describe('scale: commensurability (assignment legality dataType ≤ stamp)', () => {
  it('order (ordinal) is legal on interval and ratio, not cyclic', () => {
    expect(commensurability(Ordinal, Interval)).toBe(true); // order → x-position
    expect(commensurability(Ordinal, Ratio)).toBe(true);
    expect(commensurability(Ordinal, Cyclic)).toBe(false); // rejects month→cyclic
  });
  it('sales (ratio) is legal only on ratio', () => {
    expect(commensurability(Ratio, Ratio)).toBe(true);
    expect(commensurability(Ratio, Interval)).toBe(false); // truncated-baseline demotion is illegal
    expect(commensurability(Ratio, Ordinal)).toBe(false);
    expect(commensurability(Ratio, Cyclic)).toBe(false);
  });
  it('cyclic data (none in v1) is legal only on cyclic', () => {
    expect(commensurability(Cyclic, Cyclic)).toBe(true);
    expect(commensurability(Cyclic, Ratio)).toBe(false);
  });
});
