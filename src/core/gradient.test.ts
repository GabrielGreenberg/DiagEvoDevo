// src/core/gradient.test.ts — M5 gate for full-score gradient wiring.

import { describe, it, expect } from 'vitest';
import { type Value } from './autograd/engine';
import { gradcheckBuild } from './autograd/gradcheck';
import { seedToFigure, cloneFigure, segBase, type Figure } from './figure';
import { seedToDataSet } from './data';
import { scoreValue, scoreExact } from './score';
import { gradScore, scoreOnly } from './gradient';
import { config, N_PARAMS } from '../config';

// Comprehensive scoring (default): the full matrix of like-with-like comparisons.
const data = seedToDataSet(3);
const buildTotal = (leaves: Value[]): Value => scoreValue(leaves, data).total;

describe('gradient: full-score gradcheck (∇_autograd ≈ ∇_finite)', () => {
  // 12 seeds × 48-leaf finite differences under the strong-coincidence DEFAULT (~2× the weak
  // tape, 2026-07-03 promotion) runs ~7s — beyond vitest's 5s default. Same invariant, more time.
  it('relative L2 error < tol across many random figures; components pin the leaf-order map', { timeout: 60000 }, () => {
    for (let s = 0; s < 12; s++) {
      const f = seedToFigure(s + 1);
      const rep = gradcheckBuild(buildTotal, Array.from(f), { h: config.gradcheck.epsFD, tol: 1e-5 });
      expect(rep.relL2, `seed ${s}`).toBeLessThan(1e-5);
      // gradScore harvests the same grads the checker got from backward → pins index layout
      const gs = gradScore(f, data);
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
      const { grad } = gradScore(f, data);
      const norm = Math.hypot(...grad) || 1;
      const dir = Array.from(grad, (g) => g / norm); // unit ascent direction
      const eta = 1e-3;
      const up = cloneFigure(f);
      const down = cloneFigure(f);
      for (let i = 0; i < N_PARAMS; i++) {
        up[i] = f[i]! + eta * dir[i]!;
        down[i] = f[i]! - eta * dir[i]!;
      }
      const s0 = scoreOnly(f, data);
      expect(scoreOnly(up, data), `seed ${s} up`).toBeGreaterThan(s0);
      expect(scoreOnly(down, data), `seed ${s} down`).toBeLessThan(s0);
    }
  });
});

describe('gradient: scale is NO LONGER a symmetry (v2 salience — audit defect 3)', () => {
  // v1's score was fully scale-invariant, which is exactly how "perfect" sub-pixel encodings won
  // (resolution-free fidelity). v2 breaks the symmetry ON PURPOSE: the salience gate and the
  // legibility floor are absolute page-unit scales. Shrinking a figure below the reader's
  // resolution must LOSE reward; growing a legible figure must (weakly) gain and then saturate.
  it('shrinking a random figure far below θ collapses its reward; enlarging saturates', () => {
    const f = seedToFigure(60);
    const at = (k: number): number => {
      const s = cloneFigure(f);
      for (let i = 0; i < N_PARAMS; i++) s[i] = f[i]! * k;
      return scoreExact(s, data).reward;
    };
    const base = at(1);
    expect(at(0.001)).toBeLessThan(0.5 * base); // sub-legible: only scale-free angle residue remains
    expect(Math.abs(at(10) - at(5))).toBeLessThan(0.02); // saturation above the resolution
  });
  it('the scale direction carries a real (finite, non-NaN) gradient signal now', () => {
    const f = seedToFigure(60);
    const { grad } = gradScore(f, data);
    let dot = 0;
    for (let i = 0; i < N_PARAMS; i++) dot += grad[i]! * f[i]!;
    expect(Number.isFinite(dot)).toBe(true);
  });
});

describe('gradient: all 48 leaves are live inputs (no wiring gap)', () => {
  it('every coordinate receives gradient for some figure, and grads are always finite', () => {
    const everReceived = new Array<boolean>(N_PARAMS).fill(false);
    for (let s = 0; s < 30; s++) {
      const f: Figure = seedToFigure(s + 100);
      const { grad } = gradScore(f, data);
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
    const { grad, score } = gradScore(f, data);
    expect(Number.isFinite(score)).toBe(true);
    for (let i = 0; i < N_PARAMS; i++) expect(Number.isFinite(grad[i]!)).toBe(true);
  });
});
