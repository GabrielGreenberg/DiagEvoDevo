// src/core/scale.test.ts — gate for the scale lattice + commensurability (v2: cyclic demoted).

import { describe, it, expect } from 'vitest';
import { ScaleType, ALL_SCALE_TYPES, scaleLeq, commensurability } from './scale';

const { Ordinal, Interval, Ratio, Cyclic } = ScaleType;

describe('scale: reads-down partial order (4×4 truth table, v2)', () => {
  // linear chain ordinal ≤ interval ≤ ratio; ordinal ≤ cyclic ONLY (the audit confirmed that
  // reading interval/ratio off raw bearings is unsound: branch-cut cliffs, mirrored dials ≈ 0)
  const expected: Record<string, Record<string, boolean>> = {
    ordinal: { ordinal: true, interval: true, ratio: true, cyclic: true },
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
  it('cyclic sits ABOVE ordinal only: bearings may carry order, never interval/ratio (v2)', () => {
    expect(scaleLeq(Ordinal, Cyclic)).toBe(true); // a dial's needle rank is readable
    expect(scaleLeq(Interval, Cyclic)).toBe(false); // no linear-metric read from a raw bearing
    expect(scaleLeq(Ratio, Cyclic)).toBe(false); // ratio-from-bearing removed (open question: circular rungs)
    for (const t of [Ordinal, Interval, Ratio]) expect(scaleLeq(Cyclic, t)).toBe(false); // wrap ≰ linear
  });
});

describe('scale: commensurability (assignment legality dataType ≤ stamp)', () => {
  it('order (ordinal) is legal on interval, ratio, AND cyclic (order readable from angles)', () => {
    expect(commensurability(Ordinal, Interval)).toBe(true); // order → x-position
    expect(commensurability(Ordinal, Ratio)).toBe(true);
    expect(commensurability(Ordinal, Cyclic)).toBe(true); // order → an angle's rank
  });
  it('sales (ratio) is legal ONLY on ratio: not cyclic (v2 demotion), not interval/ordinal', () => {
    expect(commensurability(Ratio, Ratio)).toBe(true);
    expect(commensurability(Ratio, Cyclic)).toBe(false); // v2: the unsound dial-ratio edge is gone
    expect(commensurability(Ratio, Interval)).toBe(false); // truncated-baseline demotion is illegal
    expect(commensurability(Ratio, Ordinal)).toBe(false);
  });
  it('cyclic data (none in v1) is legal only on cyclic', () => {
    expect(commensurability(Cyclic, Cyclic)).toBe(true);
    expect(commensurability(Cyclic, Ratio)).toBe(false);
  });
});
