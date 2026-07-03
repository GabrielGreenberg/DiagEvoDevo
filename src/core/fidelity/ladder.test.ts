// src/core/fidelity/ladder.test.ts — adversarial gate for the v2 fidelity ladder.
//
// v2 invariants under test (each one is a CONFIRMED audit defect the redesign must kill):
//   • τ_sym is chance-corrected (constant/random ⇒ ~0) and direction-symmetric (reversed ⇒ 1);
//   • the legibility spread floor BOUNDS the ordinal gradient (no 1e8 explosion on near-constant
//     carriers) and reads sub-legible order as ties;
//   • F_ratio v2: mirrored (all-negative) proportional carriers score FULL ratio, mixed signs score
//     low, degenerate carriers get NO free reward, nothing is ever NaN;
//   • nesting survives in the direction-symmetric sense;
//   • LSE aggregation is strictly monotone and lets one perfect carrier beat many mediocre ones.

import { describe, it, expect } from 'vitest';
import { val, backward, type Value } from '../autograd/engine';
import { gradcheckBuild } from '../autograd/gradcheck';
import {
  fOrd,
  tauSym,
  fInt,
  fIntCirc,
  fRatio,
  tauSymExact,
  fIntExact,
  fIntCircExact,
  fRatioExact,
  lseMean,
  lseMeanN,
  smoothAbs,
} from './ladder';
import { rungsForData, maxRewardFor, rewardValue, rewardExact, spreadFloorFor, INT_RUNG } from './rungs';
import { ScaleType } from '../scale';
import { config } from '../../config';
import { mulberry32, uniform } from '../rng';
import { varianceN } from '../statsN';

const V = (xs: number[]): Value[] => xs.map((x) => val(x));
const arr = (xs: number[]): Float64Array => Float64Array.from(xs);
const T_SMALL = 0.005;
const EPS = config.eps.corrVar;
const S0 = config.sigma0Sq;
const KAPPA = config.ratioSign.kappa;
const MAG_EPS = config.eps.length;
const SIG_EPS = config.eps.sigDenom;
const ABS_EPS = config.eps.absSmooth;
const FLOOR = config.legibility.spreadFloorLen;

const fRatioV = (c: number[], v: number[]): number =>
  fRatio(V(c), V(v), S0, KAPPA, MAG_EPS, SIG_EPS, ABS_EPS).data;
const fRatioE = (c: number[], v: number[]): number =>
  fRatioExact(arr(c), arr(v), S0, KAPPA, MAG_EPS, SIG_EPS);
const tauSymV = (c: number[], v: number[], T = T_SMALL): number =>
  tauSym(V(c), V(v), T, FLOOR, ABS_EPS).data;

const randPositiveVec = (rng: () => number, n = 12): number[] =>
  Array.from({ length: n }, () => uniform(rng, 1, 100));

describe('ladder: ratio rung v2.1 (signed-safe, per-entry v-implied sign test)', () => {
  // v2.1 (review blocker fix): the sign test is normalized per entry by the v-implied magnitude
  // κ·ŝ·vᵢ and by the derived ceiling tanh(1/(2κ)), so a PERFECT proportional carrier scores
  // F_ratio = 1 exactly (either sign), independent of the value distribution. The earlier
  // spread-relative test capped it at a data-dependent ~0.68 and made a power-law warp the optimum.
  it('F_ratio(k·v, v) = 1 for all k>0 and scale-invariant in k (exact and differentiable)', () => {
    const rng = mulberry32(1);
    let first = -1;
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const k = uniform(rng, 0.01, 50);
      const c = v.map((x) => k * x);
      const fe = fRatioE(c, v);
      expect(fe).toBeCloseTo(1, 6); // the rung's perfect form scores 1 exactly (up to ε-guards)
      expect(fRatioV(c, v)).toBeCloseTo(fe, 5);
      if (t === 0) first = fe;
      // same v, different k ⇒ identical F (coh and base are both k-invariant)
      if (t === 0) expect(fRatioE(v.map((x) => 777 * x), v)).toBeCloseTo(first, 9);
    }
  });
  it('MIRRORED carrier c = −k·v scores EXACTLY like +k·v (a reversed axis is legible)', () => {
    const rng = mulberry32(2);
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const k = uniform(rng, 0.01, 50);
      const plus = v.map((x) => k * x);
      const minus = v.map((x) => -k * x);
      expect(fRatioE(minus, v)).toBeCloseTo(fRatioE(plus, v), 9); // perfect mirror symmetry
      expect(fRatioE(minus, v)).toBeCloseTo(1, 6);
      expect(fRatioV(minus, v)).toBeCloseTo(1, 4);
    }
  });
  it('a POWER-LAW WARP of a proportional carrier strictly loses (proportionality is the optimum)', () => {
    // the review's demonstrated v2.0 failure: c = 100·(v/vmax)^0.78 BEAT c ∝ v. Never again.
    const rng = mulberry32(21);
    for (let t = 0; t < 10; t++) {
      const v = randPositiveVec(rng);
      const vmax = Math.max(...v);
      const perfect = fRatioE(v.map((x) => (100 * x) / vmax), v);
      for (const p of [0.6, 0.78, 0.9, 1.1, 1.4]) {
        const warped = fRatioE(v.map((x) => 100 * Math.pow(x / vmax, p)), v);
        expect(warped, `warp exponent ${p}`).toBeLessThan(perfect - 1e-4);
      }
    }
  });
  it('never exceeds 1 on adversarial signed vectors (the ceiling normalization cannot overshoot)', () => {
    const rng = mulberry32(22);
    const v = randPositiveVec(rng);
    for (let t = 0; t < 500; t++) {
      // log-space perturbations of ±proportional probe the geo-mean constraint hardest
      const c = v.map((x) => x * Math.exp(uniform(rng, -3, 3)) * (uniform(rng, 0, 1) < 0.3 ? -1 : 1));
      expect(fRatioE(c, v)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('MIXED-SIGN carriers score low (sign coherence is required)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // half the entries flipped: perfect magnitude proportion, incoherent sign
    const mixed = v.map((x, i) => (i % 2 === 0 ? 3 * x : -3 * x));
    expect(fRatioE(mixed, v)).toBeLessThan(0.35);
    expect(fRatioV(mixed, v)).toBeLessThan(0.35);
    // arbitrary signed mess
    const signed = [-3, 2, -1, 4, 5, -6, 7, 8, 9, 10, 11, 12];
    expect(fRatioE(signed, v)).toBeLessThan(0.5);
  });
  it('DEGENERATE carriers: all-zero ⇒ ≈0; constant-nonzero is capped by its base defect and finite', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // all-zero: coh ≈ 0 (σ(0)=½ each) — the flat carrier earns nothing
    expect(fRatioV(new Array(12).fill(0), v)).toBeLessThan(0.02);
    expect(fRatioE(new Array(12).fill(0), v)).toBeLessThan(0.02);
    // constant nonzero: decisively signed (coh→1) but |c| is flat while v varies, so F ≤
    // exp(−Var(log v)/σ₀²) < 1 with ZERO gradient toward "more flatness" — and in the full v2
    // score a constant carrier has salience 0, so the cell is worth nothing anyway (score.test).
    const cap = Math.exp(-varianceN(Float64Array.from(v.map((x) => Math.log(x)))) / S0);
    for (const k of [-7, 3]) {
      const fv = fRatioV(new Array(12).fill(k), v);
      expect(Number.isFinite(fv)).toBe(true);
      expect(fv).toBeLessThanOrEqual(cap + 1e-9);
      expect(fv).toBeLessThan(0.75);
    }
  });
  it('is smooth across a sign change (finite gradient when one entry crosses 0)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const c = V([1e-4, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // entry 0 sits AT the crossing
    const f = fRatio(c, v.map((x) => val(x)), S0, KAPPA, MAG_EPS, SIG_EPS, ABS_EPS);
    backward(f);
    for (const ci of c) expect(Number.isFinite(ci.grad)).toBe(true);
  });
  it('F_ratio(v², v) < 1 and overall-scale invariant', () => {
    const rng = mulberry32(3);
    const v = randPositiveVec(rng);
    expect(fRatioE(v.map((x) => x * x), v)).toBeLessThan(1);
    const c = randPositiveVec(rng);
    expect(fRatioE(c, v)).toBeCloseTo(fRatioE(c.map((x) => 1000 * x), v), 9);
  });
  it('never NaN: zero, near-zero and huge entries (both paths agree)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const nasty = [0, 1e-12, -1e-12, 1e6, -1e6, 3, -3, 0, 5, 5, -5, 0.1];
    const fv = fRatioV(nasty, v);
    expect(Number.isFinite(fv)).toBe(true);
    expect(fRatioE(nasty, v)).toBeCloseTo(fv, 5);
  });
});

describe('ladder: interval rung', () => {
  it('F_int(a·v + b, v) = 1 for a≠0 (sign-blind by design; τ_sym also symmetric now)', () => {
    const rng = mulberry32(4);
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const a = uniform(rng, 0.1, 10) * (t % 2 === 0 ? 1 : -1);
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
  });
});

describe('ladder: ordinal rung v2 (τ_sym: chance-corrected, direction-symmetric)', () => {
  const v = [3, 1, 4, 1.5, 5, 9, 2, 6, 8, 7, 0.5, 10];
  it('sorted EITHER way ⇒ τ_sym = 1; the fold is symmetric', () => {
    expect(tauSymExact(arr(v), arr(v))).toBeCloseTo(1, 12);
    expect(tauSymExact(arr(v.map((x) => -x)), arr(v))).toBeCloseTo(1, 12); // reversed axis is legible
    expect(tauSymV(v, v)).toBeCloseTo(1, 4);
    expect(tauSymV(v.map((x) => -100 * x), v)).toBeCloseTo(1, 4);
  });
  it('CHANCE-ZERO: a constant carrier scores ~0 (the hidden 0.5 floor is gone)', () => {
    const flat = new Array(12).fill(42);
    expect(tauSymExact(arr(flat), arr(v))).toBeCloseTo(0, 12); // all ties ⇒ F=0.5 ⇒ τ_sym=0
    expect(tauSymV(flat, v)).toBeLessThan(1e-3);
  });
  it('random carriers sit NEAR zero, never near the old 0.5 floor', () => {
    const rng = mulberry32(6);
    let acc = 0;
    for (let t = 0; t < 50; t++) {
      const c = randPositiveVec(rng);
      const ts = tauSymExact(arr(c), arr(v));
      expect(ts).toBeLessThan(0.75); // any single draw stays well off perfection
      acc += ts;
    }
    expect(acc / 50).toBeLessThan(0.25); // mean |τ| of random permutations is small
  });
  it('is invariant under monotone transforms AND under order-reversing ones (symmetric)', () => {
    const base = tauSymExact(arr(v), arr(v));
    for (const g of [(x: number) => x ** 3, (x: number) => -Math.exp(x), (x: number) => Math.log(x + 100)]) {
      expect(tauSymExact(arr(v.map(g)), arr(v))).toBeCloseTo(base, 12);
    }
  });
  it('surrogate → exact as T → 0 (carrier spread above the legibility floor)', () => {
    const c = [12, 5, 9, 1, 7, 3, 11, 2, 8, 4, 10, 6].map((x) => 10 * x); // spread ≫ floor
    const vv = [1, 8, 3, 10, 5, 12, 2, 9, 4, 11, 6, 7];
    const exact = tauSymExact(arr(c), arr(vv));
    let prevErr = Infinity;
    for (const T of [0.5, 0.1, 0.02, 0.004]) {
      const err = Math.abs(tauSymV(c, vv, T) - exact);
      expect(err).toBeLessThanOrEqual(prevErr + 1e-9);
      prevErr = err;
    }
    expect(prevErr).toBeLessThan(1e-3);
  });
  it('fOrd stays scale-invariant ABOVE the floor: F(k·c) = F(c) for k keeping spread ≥ floor', () => {
    const c = [12, 5, 9, 1, 7, 3, 11, 2, 8, 4, 10, 6];
    const vv = [1, 8, 3, 10, 5, 12, 2, 9, 4, 11, 6, 7];
    const base = fOrd(V(c), V(vv), 0.1, FLOOR).data;
    for (const k of [1.7, 1000]) {
      expect(fOrd(V(c.map((x) => k * x)), V(vv), 0.1, FLOOR).data).toBeCloseTo(base, 8);
    }
  });
});

describe('ladder: legibility floor (audit defect 4: the 1e8 gradient explosion)', () => {
  const v = Array.from({ length: 12 }, (_, i) => i + 1);
  it('sub-legible order reads as ties: perfectly ordered but sub-floor spread ⇒ τ_sym ≈ 0 (surrogate)', () => {
    const c = v.map((x) => x * 0.001); // total span 0.011 ≪ floor 2 — sub-pixel "order"
    expect(tauSymV(c, v, config.T)).toBeLessThan(0.05); // no credit for invisible order
    expect(tauSymExact(arr(c), arr(v))).toBeCloseTo(1, 12); // exact path still reports true order
    // and the credit GROWS as the spread grows through the floor (recovery is smooth)
    const at = (s: number): number => tauSymV(v.map((x) => x * s), v, config.T);
    expect(at(0.01)).toBeGreaterThan(at(0.001));
    expect(at(10)).toBeGreaterThan(0.95);
  });
  it('BOUNDS the gradient on a near-constant carrier (was ~1e8× dominant without the floor)', () => {
    const rng = mulberry32(11);
    const c = V(v.map(() => 50 + uniform(rng, -1e-6, 1e-6))); // spread ~1e-6 ≪ floor
    const f = fOrd(c, V(v), config.T, FLOOR);
    backward(f);
    const gnorm = Math.hypot(...c.map((x) => x.grad));
    expect(Number.isFinite(gnorm)).toBe(true);
    // with denom ≥ T·floor = 0.2 each pair's slope ≤ σ'(0)/0.2 = 1.25; 66 pairs / mean ⇒ O(1)
    expect(gnorm).toBeLessThan(10);
  });
  it('the unfloored form (floor→0) really does explode there — the floor is load-bearing', () => {
    const rng = mulberry32(12);
    const c = V(v.map(() => 50 + uniform(rng, -1e-6, 1e-6)));
    const f = fOrd(c, V(v), config.T, 0, 1e-18);
    backward(f);
    const gnorm = Math.hypot(...c.map((x) => x.grad));
    expect(gnorm).toBeGreaterThan(1e3); // the disease the floor cures
  });
  it('angle carriers get the angle floor (radians), length carriers the page-unit floor', () => {
    expect(spreadFloorFor('angle', config)).toBe(config.legibility.spreadFloorAngle);
    expect(spreadFloorFor('length', config)).toBe(config.legibility.spreadFloorLen);
    expect(config.legibility.spreadFloorAngle).toBeLessThan(config.legibility.spreadFloorLen);
  });
});

describe('ladder: ∇τ_sym corrective gradient (v2 re-add of the ∇F_ord landscape invariants)', () => {
  // These optimizer-facing invariants were tested against F_ord in v1 and still hold under τ_sym
  // for carriers ABOVE chance (F_ord > 0.5): fixing an inversion must raise τ_sym and the gradient
  // must point that way. NEW under the fold: a carrier BELOW chance (mostly descending) is pushed
  // toward FULL REVERSAL — τ_sym rises on the other branch. A sign error in the smoothAbs chain
  // rule would flip exactly these assertions.
  const v = Array.from({ length: 12 }, (_, i) => i + 1); // ascending data
  const ascInverted = [10, 20, 30, 40, 50, 62, 60, 80, 90, 100, 110, 120]; // 5↔6 inverted by 2
  const gradsOf = (c: number[], T: number): number[] => {
    const leaves = V(c);
    const t = tauSym(leaves, V(v), T, FLOOR, ABS_EPS);
    backward(t);
    return leaves.map((l) => l.grad);
  };
  it('points to FIX a near-boundary inversion on a mostly-ascending carrier', () => {
    const g = gradsOf(ascInverted, config.T);
    expect(g[5]!).toBeLessThan(0); // too high → pushed down
    expect(g[6]!).toBeGreaterThan(0); // too low → pushed up
    // and the inverted pair's pull DOMINATES the correctly-ordered mid entries (corrective, not noise)
    expect(Math.abs(g[5]!)).toBeGreaterThan(5 * Math.abs(g[2]!));
    expect(Math.abs(g[6]!)).toBeGreaterThan(5 * Math.abs(g[2]!));
  });
  it('correctly-ordered c scores strictly higher than the one-swap (surrogate and exact)', () => {
    const good = [10, 20, 30, 40, 50, 60, 62, 80, 90, 100, 110, 120];
    expect(tauSymV(good, v, config.T)).toBeGreaterThan(tauSymV(ascInverted, v, config.T));
    expect(tauSymExact(arr(good), arr(v))).toBeGreaterThan(tauSymExact(arr(ascInverted), arr(v)));
  });
  it('flat once confidently ordered (small T: every pair saturated ⇒ ∇ ≈ 0)', () => {
    const sorted = Array.from({ length: 12 }, (_, i) => 10 * (i + 1));
    const gSorted = Math.hypot(...gradsOf(sorted, T_SMALL));
    expect(gSorted).toBeLessThan(1e-6);
    // while the SAME temperature still bites on the inversion (veto near the boundary, no pull far away)
    const gInv = gradsOf(ascInverted, config.T);
    expect(Math.hypot(...gInv)).toBeGreaterThan(1e-4);
  });
  it('FOLD: a mostly-DESCENDING carrier is pushed toward FULL reversal, not back to ascending', () => {
    // descending with one locally-ascending pair (5,6): full reversal wants c5 > c6
    const descInverted = [120, 110, 100, 90, 80, 60, 62, 50, 40, 30, 20, 10];
    const g = gradsOf(descInverted, config.T);
    expect(g[5]!).toBeGreaterThan(0); // pushed UP toward descending order
    expect(g[6]!).toBeLessThan(0); // pushed DOWN
    // and completing the reversal raises τ_sym (the other branch of the fold rises toward 1)
    const fullDesc = [120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    expect(tauSymV(fullDesc, v, config.T)).toBeGreaterThan(tauSymV(descInverted, v, config.T));
    expect(tauSymExact(arr(fullDesc), arr(v))).toBeCloseTo(1, 12);
  });
});

describe('ladder: circular interval rung fIntCirc (v2.2 — Mardia circular–linear R²)', () => {
  // The sound form behind the ratio≤cyclic/interval≤cyclic restore. Every property below is a
  // CONFIRMED v1 branch-cut defect this form must kill (the v1 linear-r²-on-raw-bearings cliff:
  // a 0.002 rad rotation collapsed a relation reward 5.56 → 0.84; mirrored dials scored ≈ 0).
  const v = [300, 50, 900, 140, 600, 25, 1000, 200, 450, 90, 780, 10]; // well-separated values
  const vmax = 1000;
  const wrap = (t: number): number => {
    // reduce to atan2's range (−π, π] — what an angle carrier actually returns
    let x = t;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x <= -Math.PI) x += 2 * Math.PI;
    return x;
  };
  const dialTheta = (span: number, phase = 0): number[] => v.map((x) => wrap((span / vmax) * x + phase));
  const circE = (th: number[]): number => fIntCircExact(arr(th), arr(v), EPS);
  const circV = (th: number[]): number => fIntCirc(V(th), V(v), EPS).data;

  it('a perfect dial θ = k·v scores ≈ 1 (0.9948 at 2.5 rad span; → 1 as the arc shrinks)', () => {
    expect(circE(dialTheta(2.5))).toBeGreaterThan(0.99);
    expect(circE(dialTheta(1.0))).toBeGreaterThan(0.999);
    expect(circE(dialTheta(0.3))).toBeGreaterThan(0.9999);
    expect(circV(dialTheta(2.5))).toBeCloseTo(circE(dialTheta(2.5)), 6);
  });

  it('ROTATION-INVARIANT: θ → θ+φ leaves R² unchanged even when the arc wraps past ±π', () => {
    const base = circE(dialTheta(2.5));
    for (const phase of [0.7, 1.5, 3.0, 5.0]) {
      expect(circE(dialTheta(2.5, phase)), `phase ${phase}`).toBeCloseTo(base, 9);
      expect(circV(dialTheta(2.5, phase)), `phase ${phase} (Value)`).toBeCloseTo(base, 6);
    }
  });

  it('WRAP-INVARIANT where linear r² CLIFFS: a 4-rad dial wraps, r² collapses to 0.05, R² stays 0.95', () => {
    const th = dialTheta(4.0); // bearings past π wrap to the negative branch
    expect(circE(th)).toBeGreaterThan(0.95); // the circular form reads through the cut
    expect(fIntExact(arr(th), arr(v))).toBeLessThan(0.1); // the v1 defect, demonstrated
    // and adding 2π to any subset of bearings changes NOTHING (cos/sin are the readings)
    const rewrapped = th.map((t, i) => (i % 2 === 0 ? t + 2 * Math.PI : t));
    expect(circE(rewrapped)).toBeCloseTo(circE(th), 12);
  });

  it('DIRECTION-SYMMETRIC: the mirrored dial θ → −θ scores identically (v1 scored it ≈ 0)', () => {
    for (const span of [1.0, 2.5, 4.0]) {
      const th = dialTheta(span, 0.4);
      const mirrored = th.map((t) => -t);
      expect(circE(mirrored), `span ${span}`).toBeCloseTo(circE(th), 12);
    }
  });

  it('small-arc limit: fIntCirc ≈ linear r² where linear ≈ circular (span 0.3, affine + noisy)', () => {
    // noise-free affine: the forms agree to ~1e-4 at this span
    const clean = v.map((x) => 0.5 + (0.3 / vmax) * x);
    expect(Math.abs(circE(clean) - fIntExact(arr(clean), arr(v)))).toBeLessThan(1e-3);
    // with per-item noise the circular form sits ≤ 5e-3 above r² (two regressors fit noise
    // slightly better than one — measured max 4.7e-3 over these draws), never below − 1e-3
    const rng = mulberry32(31);
    for (let t = 0; t < 10; t++) {
      const th = v.map((x) => 0.5 + (0.3 / vmax) * x + uniform(rng, -0.02, 0.02));
      const gap = circE(th) - fIntExact(arr(th), arr(v));
      expect(gap).toBeLessThan(6e-3);
      expect(gap).toBeGreaterThan(-1e-3);
    }
  });

  it('degenerates → 0, never NaN: constant θ, near-constant θ (finite grads), two-point θ', () => {
    const flat = new Array<number>(12).fill(0.7);
    expect(circE(flat)).toBe(0); // exact twin: clean degenerate ⇒ exactly 0 (early return; ε-guarded otherwise)
    expect(circV(flat)).toBe(0);
    const rng = mulberry32(11);
    const near = flat.map(() => 0.7 + uniform(rng, -1e-5, 1e-5));
    expect(circV(near)).toBeLessThan(1e-6); // ε holds the denominator: smooth → 0
    const leaves = V(near);
    const f = fIntCirc(leaves, V(v), EPS);
    backward(f);
    for (const l of leaves) expect(Number.isFinite(l.grad)).toBe(true);
    // rank-1 (two-point) bearings cannot pin an affine dial: numerator is exactly 0
    const twoPoint = v.map((x) => (x > 300 ? 1.0 : -0.5));
    expect(circE(twoPoint)).toBe(0);
    expect(circV(twoPoint)).toBeLessThan(1e-6);
  });

  it('ANTIPODAL cancellation regression (2026-07-03): θ ∈ {0, π} exactly must NOT inflate R²', () => {
    // A mixed-direction exactly-horizontal figure extracts tilt ∈ {0, π} EXACTLY; sin π = 1.2e-16
    // makes det float noise (±1e-32), and the pre-fix unguarded exact twin returned 1.476 > 1
    // through scoreExact (tilt cell q 0.07 → 0.54). Both side patterns, every value alignment:
    // the exact path must stay in [0, ~0] and in LOCKSTEP with the ε-guarded Value path.
    for (const flip of [false, true]) {
      for (let rot = 0; rot < 12; rot++) {
        const th = v.map((_, i) => ((v[(i + rot) % 12]! > 300) !== flip ? Math.PI : 0));
        // |·|: the rank-1 numerator cancels to ±float-dust (±1e-40); anything beyond dust is the bug
        expect(Math.abs(circE(th)), `flip ${flip} rot ${rot} (exact)`).toBeLessThan(1e-6);
        expect(Math.abs(circV(th)), `flip ${flip} rot ${rot} (value)`).toBeLessThan(1e-6);
      }
    }
  });

  it('∈ [0,1] on 500 adversarial draws; chance level ≈ 2/(n−1), far from 1', () => {
    const rng = mulberry32(12);
    let acc = 0;
    const N = 500;
    for (let t = 0; t < N; t++) {
      const th = Array.from({ length: 12 }, () => uniform(rng, -Math.PI, Math.PI));
      const f = circE(th);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1 + 1e-9);
      acc += f;
    }
    expect(acc / N).toBeLessThan(0.3); // measured 0.18 ≈ 2/(n−1): two regressors' chance floor
    expect(acc / N).toBeGreaterThan(0.05); // and the measure is alive, not stuck at 0
  });

  it('gradcheck: composed from gradchecked primitives, the full form still matches FD', () => {
    const rng = mulberry32(13);
    for (let t = 0; t < 5; t++) {
      const th = Array.from({ length: 8 }, () => uniform(rng, -2.5, 2.5));
      const rep = gradcheckBuild(
        (leaves) => fIntCirc(leaves, V(v.slice(0, 8)), EPS),
        th,
        { h: config.gradcheck.epsFD, tol: config.gradcheck.tol },
      );
      expect(rep.relL2, `trial ${t}`).toBeLessThan(config.gradcheck.tol);
    }
  });

  it('rung routing: INT_RUNG selects the circular form for angle carriers ONLY (both paths)', () => {
    const th = dialTheta(2.5, 0.9); // rotated: circular and linear forms genuinely differ here
    expect(INT_RUNG.fExact(arr(th), arr(v), config, 'angle')).toBeCloseTo(circE(th), 12);
    expect(INT_RUNG.fExact(arr(th), arr(v), config, 'length')).toBeCloseTo(fIntExact(arr(th), arr(v)), 12);
    expect(INT_RUNG.fDiff(V(th), V(v), config, 'angle').data).toBeCloseTo(circV(th), 12);
    expect(INT_RUNG.fDiff(V(th), V(v), config, 'length').data).toBeCloseTo(fInt(V(th), V(v), EPS).data, 12);
    // the two forms disagree on this input — the routing is load-bearing, not cosmetic
    expect(Math.abs(circE(th) - fIntExact(arr(th), arr(v)))).toBeGreaterThan(0.05);
  });
});

describe('ladder: NESTING v2 (perfect ratio ⇒ perfect interval ⇒ perfect |order|, both directions)', () => {
  it('c = ±k·v maxes ALL rungs: ratio = int = τ_sym = 1', () => {
    const rng = mulberry32(7);
    for (let t = 0; t < 30; t++) {
      const v = randPositiveVec(rng);
      const k = uniform(rng, 0.05, 20) * (t % 2 === 0 ? 1 : -1);
      const c = v.map((x) => k * x);
      expect(fRatioE(c, v)).toBeCloseTo(1, 6);
      expect(fIntExact(arr(c), arr(v))).toBeCloseTo(1, 9);
      expect(tauSymExact(arr(c), arr(v))).toBeCloseTo(1, 12);
    }
  });
  it('c = a·v + b (a≠0) makes int=1 and τ_sym=1 (ratio may be <1 when b≠0)', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const c = v.map((x) => 2 * x + 5);
    expect(fIntExact(arr(c), arr(v))).toBeCloseTo(1, 9);
    expect(tauSymExact(arr(c), arr(v))).toBeCloseTo(1, 12);
    expect(fRatioE(c, v)).toBeLessThan(1);
  });
  it('implication holds on random samples: whenever an inner rung ≈1, looser rungs ≈1', () => {
    const rng = mulberry32(8);
    for (let t = 0; t < 200; t++) {
      const v = randPositiveVec(rng);
      const c = randPositiveVec(rng);
      const fr = fRatioE(c, v);
      const fi = fIntExact(arr(c), arr(v));
      const fo = tauSymExact(arr(c), arr(v));
      if (fr > 0.999) expect(fi).toBeGreaterThan(0.99);
      if (fi > 0.999) expect(fo).toBeGreaterThan(0.99);
    }
  });
});

describe('ladder: differentiable value matches exact (same formula, smooth |·| aside)', () => {
  it('fInt.data ≈ fIntExact and fRatio.data ≈ fRatioExact on random and SIGNED vectors', () => {
    const rng = mulberry32(9);
    for (let t = 0; t < 20; t++) {
      const v = randPositiveVec(rng);
      const c = randPositiveVec(rng).map((x) => (t % 3 === 0 ? -x : x));
      expect(fInt(V(c), V(v), EPS).data).toBeCloseTo(fIntExact(arr(c), arr(v)), 5);
      expect(fRatioV(c, v)).toBeCloseTo(fRatioE(c, v), 5);
    }
  });
});

describe('ladder: LSE aggregation (the v1 linear sum is the confirmed mush-maker)', () => {
  const beta = config.aggregation.beta;
  it('strictly monotone: raising any cell strictly raises the aggregate', () => {
    const qs = [0.2, 0.5, 0.05, 0.9, 0.0];
    const base = lseMeanN(qs, beta);
    for (let i = 0; i < qs.length; i++) {
      const up = qs.slice();
      up[i] = up[i]! + 0.05;
      expect(lseMeanN(up, beta)).toBeGreaterThan(base);
    }
  });
  it('one PERFECT carrier beats many mediocre ones (division-of-labor pressure)', () => {
    const n = 12;
    const onePerfect = [1, ...new Array<number>(n - 1).fill(0)];
    const allMediocre = new Array<number>(n).fill(0.6);
    expect(lseMeanN(onePerfect, beta)).toBeGreaterThan(lseMeanN(allMediocre, beta));
  });
  it('bounded by the max (mean-form) and ≥ the mean; Value path agrees with exact', () => {
    const qs = [0.3, 0.9, 0.1, 0.6];
    const l = lseMeanN(qs, beta);
    expect(l).toBeLessThanOrEqual(Math.max(...qs));
    expect(l).toBeGreaterThanOrEqual(qs.reduce((a, b) => a + b, 0) / qs.length);
    expect(lseMean(V(qs), beta).data).toBeCloseTo(l, 9);
    expect(lseMeanN([], beta)).toBe(0);
  });
  it('smoothAbs is a faithful |·| away from 0 and smooth at 0', () => {
    expect(smoothAbs(val(0.5), ABS_EPS).data).toBeCloseTo(0.5, 6);
    expect(smoothAbs(val(-0.5), ABS_EPS).data).toBeCloseTo(0.5, 6);
    const x = val(0);
    const y = smoothAbs(x, ABS_EPS);
    backward(y);
    expect(Number.isFinite(x.grad)).toBe(true);
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
  it('a perfect ratio carrier reaches the max 3-rung reward, either direction, ord/int exactly 1', () => {
    const v = [5, 3, 9, 1, 7, 11, 2, 8, 6, 10, 4, 12];
    const max = maxRewardFor(ScaleType.Ratio, config);
    for (const k of [2.5, -2.5]) {
      const c = v.map((x) => k * x);
      const rw = rewardValue(V(c), V(v), ScaleType.Ratio, { ...config, T: 0.005 }, 'length');
      expect(rw.total.data).toBeGreaterThan(0.999 * max); // v2.1: F_ratio(±k·v) = 1 exactly
      const re = rewardExact(arr(c), arr(v), ScaleType.Ratio, config, 'length');
      expect(re.total).toBeGreaterThan(0.999 * max);
      expect(re.total).toBeLessThanOrEqual(max + 1e-9);
      expect(re.rungs.map((r) => r.name)).toEqual(['ord', 'int', 'ratio']);
      expect(re.rungs[0]!.f).toBeCloseTo(1, 9); // τ_sym
      expect(re.rungs[1]!.f).toBeCloseTo(1, 9); // r²
    }
  });
});

describe('config: weight ordering invariant w_ord < w_int < w_ratio', () => {
  it('holds (more captured structure always scores higher)', () => {
    const { w_ord, w_int, w_ratio } = config.weights;
    expect(w_ord).toBeLessThan(w_int);
    expect(w_int).toBeLessThan(w_ratio);
  });
});
