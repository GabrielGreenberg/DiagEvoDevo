// src/core/fidelity/ladder.test.ts — M3 gate for the fidelity ladder.

import { describe, it, expect } from 'vitest';
import { val, backward, type Value } from '../autograd/engine';
import { fOrd, fInt, fRatio, fOrdExact, fIntExact, fRatioExact } from './ladder';
import { rungsForData, maxRewardFor, rewardValue, rewardExact } from './rungs';
import { ScaleType } from '../scale';
import { config } from '../../config';
import { mulberry32, uniform } from '../rng';

const V = (xs: number[]): Value[] => xs.map((x) => val(x));
const arr = (xs: number[]): Float64Array => Float64Array.from(xs);
const T_SMALL = 0.005;
const EPS = config.eps.corrVar;
const S0 = config.sigma0Sq;

const randPositiveVec = (rng: () => number, n = 12): number[] =>
  Array.from({ length: n }, () => uniform(rng, 1, 100));

describe('ladder: ratio rung', () => {
  it('F_ratio(k·v, v) = 1 for all k>0 (exact and differentiable)', () => {
    const rng = mulberry32(1);
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const k = uniform(rng, 0.01, 50);
      const c = v.map((x) => k * x);
      expect(fRatioExact(arr(c), arr(v), S0)).toBeCloseTo(1, 12);
      expect(fRatio(V(c), V(v), S0).data).toBeCloseTo(1, 9);
    }
  });
  it('F_ratio(v², v) < 1', () => {
    const rng = mulberry32(2);
    const v = randPositiveVec(rng);
    const c = v.map((x) => x * x);
    expect(fRatioExact(arr(c), arr(v), S0)).toBeLessThan(1);
    expect(fRatio(V(c), V(v), S0).data).toBeLessThan(1);
  });
  it('is invariant to the figure overall scale k (same defect for c and 1000·c)', () => {
    const rng = mulberry32(3);
    const v = randPositiveVec(rng);
    const c = randPositiveVec(rng);
    expect(fRatioExact(arr(c), arr(v), S0)).toBeCloseTo(
      fRatioExact(arr(c.map((x) => 1000 * x)), arr(v), S0),
      12,
    );
  });
});

describe('ladder: interval rung', () => {
  it('F_int(a·v + b, v) = 1 for a>0, b (exact and differentiable)', () => {
    const rng = mulberry32(4);
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const a = uniform(rng, 0.1, 10);
      const b = uniform(rng, -50, 50);
      const c = v.map((x) => a * x + b);
      expect(fIntExact(arr(c), arr(v))).toBeCloseTo(1, 9);
      expect(fInt(V(c), V(v), EPS).data).toBeCloseTo(1, 6);
    }
  });
  it('F_int(v², v) < 1', () => {
    const rng = mulberry32(5);
    const v = randPositiveVec(rng);
    const c = v.map((x) => x * x);
    expect(fIntExact(arr(c), arr(v))).toBeLessThan(1);
    expect(fInt(V(c), V(v), EPS).data).toBeLessThan(1);
  });
  it('is sign-blind: perfect anti-correlation also scores 1 (documented; ordinal rung distinguishes)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const c = v.map((x) => -3 * x + 7);
    expect(fIntExact(arr(c), arr(v))).toBeCloseTo(1, 9);
    // but the ordinal rung correctly gives 0 for reversed order
    expect(fOrdExact(arr(c), arr(v))).toBeCloseTo(0, 9);
  });
});

describe('ladder: ordinal rung', () => {
  const v = [3, 1, 4, 1.5, 5, 9, 2, 6, 8, 7, 0.5, 10];
  it('F_ord(monotone↑(v), v) = 1; F_ord(reverse, v) = 0', () => {
    expect(fOrdExact(arr(v), arr(v))).toBeCloseTo(1, 12);
    const reversedByValue = v.map((x) => -x); // strictly order-reversing
    expect(fOrdExact(arr(reversedByValue), arr(v))).toBeCloseTo(0, 12);
    // differentiable, small T
    expect(fOrd(V(v), V(v), T_SMALL).data).toBeCloseTo(1, 6);
    expect(fOrd(V(reversedByValue), V(v), T_SMALL).data).toBeCloseTo(0, 6);
  });
  it('is invariant under any monotone-increasing transform of c', () => {
    const base = fOrdExact(arr(v), arr(v));
    for (const g of [(x: number) => x ** 3, (x: number) => Math.exp(x), (x: number) => Math.log(x + 100)]) {
      expect(fOrdExact(arr(v.map(g)), arr(v))).toBeCloseTo(base, 12);
    }
  });
  it('differentiable surrogate → exact as T → 0', () => {
    const rng = mulberry32(6);
    const v = randPositiveVec(rng);
    const c = randPositiveVec(rng); // generic, non-tied
    const exact = fOrdExact(arr(c), arr(v));
    let prevErr = Infinity;
    for (const T of [0.5, 0.1, 0.02, 0.004]) {
      const err = Math.abs(fOrd(V(c), V(v), T).data - exact);
      expect(err).toBeLessThanOrEqual(prevErr + 1e-9); // monotone-ish convergence
      prevErr = err;
    }
    expect(prevErr).toBeLessThan(1e-3);
  });
});

describe('ladder: NESTING (F_ratio=1 ⇒ F_int=1 ⇒ F_ord=1)', () => {
  it('c = k·v (k>0) makes all three rungs = 1', () => {
    const rng = mulberry32(7);
    for (let t = 0; t < 30; t++) {
      const v = randPositiveVec(rng);
      const k = uniform(rng, 0.05, 20);
      const c = v.map((x) => k * x);
      expect(fRatioExact(arr(c), arr(v), S0)).toBeCloseTo(1, 9);
      expect(fIntExact(arr(c), arr(v))).toBeCloseTo(1, 9);
      expect(fOrdExact(arr(c), arr(v))).toBeCloseTo(1, 12);
    }
  });
  it('c = a·v + b (a>0) makes int=1 and ord=1 (ratio may be <1 when b≠0)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const c = v.map((x) => 2 * x + 5);
    expect(fIntExact(arr(c), arr(v))).toBeCloseTo(1, 9);
    expect(fOrdExact(arr(c), arr(v))).toBeCloseTo(1, 12);
    expect(fRatioExact(arr(c), arr(v), S0)).toBeLessThan(1); // baseline shift breaks ratio
  });
  it('implication holds on random samples: whenever an inner rung ≈1, looser rungs ≈1', () => {
    const rng = mulberry32(8);
    for (let t = 0; t < 200; t++) {
      const v = randPositiveVec(rng);
      const c = randPositiveVec(rng);
      const fr = fRatioExact(arr(c), arr(v), S0);
      const fi = fIntExact(arr(c), arr(v));
      const fo = fOrdExact(arr(c), arr(v));
      if (fr > 0.999) expect(fi).toBeGreaterThan(0.99);
      if (fi > 0.999) expect(fo).toBeGreaterThan(0.99);
    }
  });
});

describe('ladder: differentiable value matches exact for int/ratio (same formula)', () => {
  it('fInt.data ≈ fIntExact and fRatio.data ≈ fRatioExact', () => {
    const rng = mulberry32(9);
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const c = randPositiveVec(rng);
      expect(fInt(V(c), V(v), EPS).data).toBeCloseTo(fIntExact(arr(c), arr(v)), 5);
      expect(fRatio(V(c), V(v), S0).data).toBeCloseTo(fRatioExact(arr(c), arr(v), S0), 9);
    }
  });
});

describe('ladder: ∇F_ord landscape (flat-in-order, corrective across inversion)', () => {
  // NOTE: sigmoid' is symmetric, so the ordinal gradient's MAGNITUDE depends on the pair's margin
  // |cᵢ−cⱼ|/T, not on whether it is right or wrong — it is strongest NEAR the decision boundary
  // (small margins) and saturates to ~0 for large margins either way. So the surrogate "vetoes
  // inversions but does not pull" once confidently ordered; the strong corrective signal appears
  // near boundaries. This is exactly why evolution/restarts handle global ordering while GD polishes.
  const v = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

  it('flat (tiny gradient) for a correctly-ordered, confident c', () => {
    const c = V(v); // unit margins, T=0.1 ⇒ saturated
    const f = fOrd(c, V(v), config.T);
    backward(f);
    const gnorm = Math.hypot(...c.map((x) => x.grad));
    expect(f.data).toBeGreaterThan(0.99);
    expect(gnorm).toBeLessThan(1e-3); // does not pull once confidently ordered
  });

  it('gradient points to FIX an inversion, and a near-boundary inversion is steep', () => {
    // near-boundary inversion at positions 5,6 (v=6<7): c5 slightly ABOVE c6 (wrong, small margin)
    const cNums = v.slice();
    cNums[5] = 6.6;
    cNums[6] = 6.5;
    const c = V(cNums);
    backward(fOrd(c, V(v), config.T));
    expect(c[5]!.grad).toBeLessThan(0); // lower c5
    expect(c[6]!.grad).toBeGreaterThan(0); // raise c6
    const invNorm = Math.abs(c[5]!.grad) + Math.abs(c[6]!.grad);

    const cGood = V(v);
    backward(fOrd(cGood, V(v), config.T));
    const goodMax = Math.max(...cGood.map((x) => Math.abs(x.grad)));
    expect(invNorm).toBeGreaterThan(10 * goodMax); // steep near the boundary
  });

  it('correctly-ordered c scores strictly higher than an inverted one', () => {
    const good = fOrd(V(v), V(v), config.T).data;
    const badNums = v.slice();
    [badNums[5], badNums[6]] = [badNums[6]!, badNums[5]!];
    const bad = fOrd(V(badNums), V(v), config.T).data;
    expect(good).toBeGreaterThan(bad);
  });
});

describe('rungs: height-cap by data scale type', () => {
  it('sales (ratio) → 3 rungs [ord,int,ratio]; order (ordinal) → 1 rung [ord]', () => {
    expect(rungsForData(ScaleType.Ratio).map((r) => r.name)).toEqual(['ord', 'int', 'ratio']);
    expect(rungsForData(ScaleType.Ordinal).map((r) => r.name)).toEqual(['ord']);
    expect(rungsForData(ScaleType.Interval).map((r) => r.name)).toEqual(['ord', 'int']);
  });
  it('maxRewardFor sums the included rung weights', () => {
    const { w_ord, w_int, w_ratio } = config.weights;
    expect(maxRewardFor(ScaleType.Ratio, config)).toBeCloseTo(w_ord + w_int + w_ratio, 12);
    expect(maxRewardFor(ScaleType.Ordinal, config)).toBeCloseTo(w_ord, 12);
  });
  it('a perfect ratio carrier attains the max 3-rung reward', () => {
    const v = [5, 3, 9, 1, 7, 11, 2, 8, 6, 10, 4, 12];
    const c = v.map((x) => 2.5 * x); // c = k·v ⇒ all rungs 1
    const rw = rewardValue(V(c), V(v), ScaleType.Ratio, config);
    expect(rw.total.data).toBeCloseTo(maxRewardFor(ScaleType.Ratio, config), 6);
    const re = rewardExact(arr(c), arr(v), ScaleType.Ratio, config);
    expect(re.total).toBeCloseTo(maxRewardFor(ScaleType.Ratio, config), 6);
    expect(re.rungs.map((r) => r.name)).toEqual(['ord', 'int', 'ratio']);
  });
});

describe('config: weight ordering invariant w_ord < w_int < w_ratio', () => {
  it('holds (more captured structure always scores higher)', () => {
    const { w_ord, w_int, w_ratio } = config.weights;
    expect(w_ord).toBeLessThan(w_int);
    expect(w_int).toBeLessThan(w_ratio);
  });
});
