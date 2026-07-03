// src/core/scale.test.ts — gate for the scale lattice + commensurability (v2.2: circular edges
// RESTORED — dials/gauges are legitimate encodings; the sound circular rung forms live in
// fidelity/ladder.ts, routed by unit class in fidelity/rungs.ts).

import { describe, it, expect } from 'vitest';
import { ScaleType, ALL_SCALE_TYPES, scaleLeq, commensurability } from './scale';

const { Ordinal, Interval, Ratio, Cyclic } = ScaleType;

describe('scale: reads-down partial order (4×4 truth table, v2.2)', () => {
  // the FULL chain ordinal ≤ interval ≤ ratio ≤ cyclic. The v2 demotion (cyclic above ordinal
  // only) answered a rung-FORM defect (linear stats on raw bearings cliff at the ±π cut); with
  // fIntCirc and the wrap-continuous fRatio the lattice carries the honest structure again: an
  // angle reads down to ratio (gauge), interval (dial with arbitrary zero), and order.
  const expected: Record<string, Record<string, boolean>> = {
    ordinal: { ordinal: true, interval: true, ratio: true, cyclic: true },
    interval: { ordinal: false, interval: true, ratio: true, cyclic: true },
    ratio: { ordinal: false, interval: false, ratio: true, cyclic: true },
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
  it('cyclic is the TOP element (v2.2): every linear type reads off an angle, wrap ≰ linear', () => {
    expect(scaleLeq(Ordinal, Cyclic)).toBe(true); // a dial's needle rank is readable
    expect(scaleLeq(Interval, Cyclic)).toBe(true); // a dial with an arbitrary zero (fIntCirc)
    expect(scaleLeq(Ratio, Cyclic)).toBe(true); // a gauge: bearing ∝ value (wrap-continuous fRatio)
    for (const t of [Ordinal, Interval, Ratio]) expect(scaleLeq(Cyclic, t)).toBe(false); // wrap ≰ linear
  });
});

describe('scale: commensurability (assignment legality dataType ≤ stamp)', () => {
  it('order (ordinal) is legal on interval, ratio, AND cyclic (order readable from angles)', () => {
    expect(commensurability(Ordinal, Interval)).toBe(true); // order → x-position
    expect(commensurability(Ordinal, Ratio)).toBe(true);
    expect(commensurability(Ordinal, Cyclic)).toBe(true); // order → an angle's rank
  });
  it('sales (ratio) is legal on ratio AND cyclic (v2.2: dials are back); never interval/ordinal', () => {
    expect(commensurability(Ratio, Ratio)).toBe(true);
    expect(commensurability(Ratio, Cyclic)).toBe(true); // a gauge is a legitimate ratio encoding
    expect(commensurability(Ratio, Interval)).toBe(false); // truncated-baseline demotion is illegal
    expect(commensurability(Ratio, Ordinal)).toBe(false);
  });
  it('NO reading is structurally blocked (user directive): every v1-geometry stamp carries BOTH relations', () => {
    for (const stamp of [Ratio, Cyclic]) {
      expect(commensurability(Ratio, stamp), `sales on ${stamp}`).toBe(true);
      expect(commensurability(Ordinal, stamp), `order on ${stamp}`).toBe(true);
    }
  });
  it('cyclic data (none in v1) is legal only on cyclic', () => {
    expect(commensurability(Cyclic, Cyclic)).toBe(true);
    expect(commensurability(Cyclic, Ratio)).toBe(false);
  });
});
