// src/core/gradient.test.ts — M5 gate for full-score gradient wiring.

import { describe, it, expect } from 'vitest';
import { type Value } from './autograd/engine';
import { gradcheckBuild } from './autograd/gradcheck';
import { seedToFigure, cloneFigure, segBase, type Figure } from './figure';
import { seedToDataSet } from './data';
import { FixedAssignment } from './assignment';
import { scoreValue, scoreExact, resolveAssignment } from './score';
import { gradScore, scoreOnly } from './gradient';
import { config, N_PARAMS } from '../config';

const data = seedToDataSet(3);
const map = resolveAssignment(FixedAssignment, data, seedToFigure(1));
const buildTotal = (leaves: Value[]): Value => scoreValue(leaves, data, map).total;

describe('gradient: full-score gradcheck (∇_autograd ≈ ∇_finite)', () => {
  it('relative L2 error < tol across many random figures; components pin the leaf-order map', () => {
    for (let s = 0; s < 12; s++) {
      const f = seedToFigure(s + 1);
      const rep = gradcheckBuild(buildTotal, Array.from(f), { h: config.gradcheck.epsFD, tol: 1e-5 });
      expect(rep.relL2, `seed ${s}`).toBeLessThan(1e-5);
      // gradScore harvests the same grads the checker got from backward → pins index layout
      const gs = gradScore(f, data, map);
      for (let i = 0; i < N_PARAMS; i++) {
        expect(gs.grad[i]!, `seed ${s} leaf ${i}`).toBeCloseTo(rep.adGrad[i]!, 9);
      }
    }
  });
});

describe('gradient: points uphill (score is a reward we maximize)', () => {
  it('+η·∇S increases S and −η·∇S decreases S for random non-optimal figures', () => {
    for (let s = 0; s < 8; s++) {
      const f = seedToFigure(s + 20);
      const { grad } = gradScore(f, data, map);
      const norm = Math.hypot(...grad) || 1;
      const dir = Array.from(grad, (g) => g / norm); // unit ascent direction
      const eta = 1e-3;
      const up = cloneFigure(f);
      const down = cloneFigure(f);
      for (let i = 0; i < N_PARAMS; i++) {
        up[i] = f[i]! + eta * dir[i]!;
        down[i] = f[i]! - eta * dir[i]!;
      }
      const s0 = scoreOnly(f, data, map);
      expect(scoreOnly(up, data, map), `seed ${s} up`).toBeGreaterThan(s0);
      expect(scoreOnly(down, data, map), `seed ${s} down`).toBeLessThan(s0);
    }
  });
});

describe('gradient: ∇S orthogonal to the invariant directions (CONCEPT §9)', () => {
  // uniform horizontal translation: shift every x-coordinate (offsets 0=sx, 2=ex) by the same amount
  const xTransDir = (): Float64Array => {
    const d = new Float64Array(N_PARAMS);
    for (let i = 0; i < N_PARAMS; i++) d[i] = i % 4 === 0 || i % 4 === 2 ? 1 : 0;
    return d;
  };
  it('gradient ⟂ horizontal-translation direction, and the score is flat along it', () => {
    const dX = xTransDir();
    for (let s = 0; s < 6; s++) {
      const f = seedToFigure(s + 40);
      const { grad } = gradScore(f, data, map);
      let dot = 0;
      let gn = 0;
      for (let i = 0; i < N_PARAMS; i++) {
        dot += grad[i]! * dX[i]!;
        gn += grad[i]! * grad[i]!;
      }
      const rel = Math.abs(dot) / (Math.sqrt(gn) * Math.sqrt(N_PARAMS / 2) + 1e-30);
      expect(rel, `seed ${s} translation`).toBeLessThan(1e-6);
      // directional finite difference is also flat
      const h = 1e-3;
      const shifted = cloneFigure(f);
      for (let i = 0; i < N_PARAMS; i++) shifted[i] = f[i]! + h * dX[i]!;
      expect(Math.abs(scoreOnly(shifted, data, map) - scoreOnly(f, data, map))).toBeLessThan(1e-9);
    }
  });
  it('EXACT reward is scale-k invariant; the differentiable residual is only the ordinal surrogate (→0 as T→0)', () => {
    // The EXACT reward is truly scale-invariant for ANY figure (fRatio/fInt/fOrd all scale-invariant).
    const f = seedToFigure(60);
    const scaled = cloneFigure(f);
    for (let i = 0; i < N_PARAMS; i++) scaled[i] = f[i]! * 1.7;
    expect(scoreExact(scaled, data, map).reward).toBeCloseTo(scoreExact(f, data, map).reward, 9);

    // The DIFFERENTIABLE gradient is only APPROXIMATELY ⟂ scale: the ordinal surrogate depends on
    // margins |cᵢ−cⱼ|/T, so scaling inflates margins. The residual shrinks as T→0 (surrogate → step).
    const scaleRel = (T: number): number => {
      const cfg = { ...config, T };
      const { grad } = gradScore(f, data, map, cfg);
      let dot = 0;
      let gn = 0;
      let xn = 0;
      for (let i = 0; i < N_PARAMS; i++) {
        dot += grad[i]! * f[i]!;
        gn += grad[i]! * grad[i]!;
        xn += f[i]! * f[i]!;
      }
      return Math.abs(dot) / (Math.sqrt(gn) * Math.sqrt(xn) + 1e-30);
    };
    // The spread-normalized ordinal surrogate is ITSELF scale-invariant, so ∇S ⟂ scale to machine
    // precision at every temperature (the M5 residual that motivated normalization is now gone: ~1e-13).
    expect(scaleRel(0.1)).toBeLessThan(1e-6);
    expect(scaleRel(0.004)).toBeLessThan(1e-6);
  });
});

describe('gradient: all 48 leaves are live inputs (no wiring gap)', () => {
  it('every coordinate receives gradient for some figure, and grads are always finite', () => {
    const everReceived = new Array<boolean>(N_PARAMS).fill(false);
    for (let s = 0; s < 30; s++) {
      const f: Figure = seedToFigure(s + 100);
      const { grad } = gradScore(f, data, map);
      for (let i = 0; i < N_PARAMS; i++) {
        expect(Number.isFinite(grad[i]!), `seed ${s} leaf ${i} finite`).toBe(true);
        if (Math.abs(grad[i]!) > 1e-9) everReceived[i] = true;
      }
    }
    // no leaf is dead across all figures → all 48 are reachable inputs to the score graph
    expect(everReceived.every((b) => b)).toBe(true);
    expect(everReceived.filter((b) => b).length).toBe(N_PARAMS);
  });

  it('no NaN/Inf even for a nearly-degenerate (short) segment', () => {
    const f = seedToFigure(7);
    // collapse segment 0 to a very short (nonzero) length
    const b = segBase(0);
    f[b + 2] = f[b + 0]! + 1e-6;
    f[b + 3] = f[b + 1]! + 1e-6;
    const { grad, score } = gradScore(f, data, map);
    expect(Number.isFinite(score)).toBe(true);
    for (let i = 0; i < N_PARAMS; i++) expect(Number.isFinite(grad[i]!)).toBe(true);
  });
});
