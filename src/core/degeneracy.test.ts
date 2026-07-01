// src/core/degeneracy.test.ts
//
// Regression tests for the degeneracy defects found by the M4 adversarial review:
//   1. a zero-length segment must NOT make the reward/gradient NaN (magnitude ε-floor),
//   2. circularVar must be ≥ 0 and = 0 at a common orientation (never a negative penalty),
//   3. atan2 at the origin must yield finite (zero) gradients (no 0/0),
//   4. frozenDof with a nonzero weight must stay finite even for a collapsed segment.
// These are latent optimizer-killers: without them, one Adam/mutation step landing start==end would
// poison the whole 48-vector gradient with NaN and Adam's moments would propagate it forever.

import { describe, it, expect } from 'vitest';
import { val, atan2, backward } from './autograd/engine';
import { circularVar } from './autograd/ops';
import { circularVarN } from './statsN';
import { config, type Config, N_PARAMS } from '../config';
import { seedToFigure, segBase } from './figure';
import { seedToDataSet } from './data';
import { FixedAssignment } from './assignment';
import { resolveAssignment } from './score';
import { gradScore } from './gradient';

const data = seedToDataSet(1);
const map = resolveAssignment(FixedAssignment, data, seedToFigure(1));
const allFinite = (a: Float64Array): boolean => a.every((x) => Number.isFinite(x));

describe('degeneracy #1: zero-length segments never NaN the reward or gradient (default config)', () => {
  it('one exactly-collapsed segment → finite score and all 48 finite grads', () => {
    const f = seedToFigure(1);
    const b = segBase(3);
    f[b + 2] = f[b + 0]!; // end.x = start.x
    f[b + 3] = f[b + 1]!; // end.y = start.y  → length 0
    const { score, grad } = gradScore(f, data, map);
    expect(Number.isFinite(score)).toBe(true);
    expect(allFinite(grad)).toBe(true);
  });
  it('ALL segments collapsed → still finite (no NaN anywhere)', () => {
    const f = seedToFigure(2);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      f[b + 2] = f[b + 0]!;
      f[b + 3] = f[b + 1]!;
    }
    const { score, grad } = gradScore(f, data, map);
    expect(Number.isFinite(score)).toBe(true);
    expect(allFinite(grad)).toBe(true);
  });
  it('near-zero length (1e-9) is finite too', () => {
    const f = seedToFigure(3);
    const b = segBase(0);
    f[b + 2] = f[b + 0]! + 1e-9;
    f[b + 3] = f[b + 1]! + 1e-9;
    const { score, grad } = gradScore(f, data, map);
    expect(Number.isFinite(score)).toBe(true);
    expect(allFinite(grad)).toBe(true);
  });
});

describe('degeneracy #2: circularVar ≥ 0 always, = 0 at a common orientation', () => {
  const commonOrientation = new Array(12).fill(Math.PI / 2); // all bars vertical
  it('is exactly ≥ 0 and ≈ 0 at a common orientation (both paths, default and tuned eps)', () => {
    for (const eps of [config.eps.circular, 1e-6, 1e-3]) {
      const exact = circularVarN(commonOrientation, eps);
      const diff = circularVar(commonOrientation.map((t) => val(t)), eps).data;
      expect(exact, `exact eps=${eps}`).toBeGreaterThanOrEqual(0);
      expect(exact, `exact eps=${eps}`).toBeLessThan(1e-9);
      expect(diff, `diff eps=${eps}`).toBeGreaterThanOrEqual(0);
      expect(diff, `diff eps=${eps}`).toBeLessThan(1e-9);
    }
  });
  it('is in [0,1] for arbitrary angle spreads', () => {
    const spreads = [
      [0, 0, 0, Math.PI, Math.PI, Math.PI, 0, 0, 0, Math.PI, Math.PI, Math.PI],
      Array.from({ length: 12 }, (_, i) => (i / 12) * 2 * Math.PI), // uniform → max spread
      Array.from({ length: 12 }, (_, i) => Math.sin(i) * 3),
    ];
    for (const s of spreads) {
      const v = circularVarN(s, config.eps.circular);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(circularVar(s.map((t) => val(t)), config.eps.circular).data).toBeCloseTo(v, 9);
    }
  });
});

describe('degeneracy #3: atan2 at the origin yields finite gradients', () => {
  it('atan2(0,0) backward gives finite (zero) grads, not NaN', () => {
    const y = val(0);
    const x = val(0);
    const o = atan2(y, x);
    backward(o);
    expect(Number.isFinite(y.grad)).toBe(true);
    expect(Number.isFinite(x.grad)).toBe(true);
    expect(y.grad).toBe(0);
    expect(x.grad).toBe(0);
  });
});

describe('degeneracy #4: frozenDof with weight on stays finite for collapsed segments', () => {
  it('gradScore with frozenDof=1 + a collapsed segment → finite score and grads', () => {
    const cfg2: Config = { ...config, penalties: { ...config.penalties, frozenDof: 1 } };
    const f = seedToFigure(4);
    const b = segBase(5);
    f[b + 2] = f[b + 0]!;
    f[b + 3] = f[b + 1]!;
    const { score, grad } = gradScore(f, data, map, cfg2);
    expect(Number.isFinite(score)).toBe(true);
    for (let i = 0; i < N_PARAMS; i++) expect(Number.isFinite(grad[i]!), `leaf ${i}`).toBe(true);
  });
});
