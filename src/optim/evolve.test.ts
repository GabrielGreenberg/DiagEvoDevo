// src/optim/evolve.test.ts — v2 gate for the multi-start outer layer: trajectory start points and
// the deterministic fresh/mutant replacement schedule (no generations, no culling — those died with
// optimizer v2; the session tests cover the replacement lifecycle end to end).

import { describe, it, expect } from 'vitest';
import {
  initialFigures,
  randomFigure,
  mutateFigure,
  populationRng,
  isMutantRestart,
} from './evolve';
import { seedToFigure } from '../core/figure';
import { mulberry32 } from '../core/rng';
import { config, N_PARAMS } from '../config';

describe('evolve: reproducibility of trajectory start points', () => {
  it('initialFigures is deterministic from the figure seed and puts the seeded figure in slot 0', () => {
    const a = initialFigures(7, config.evolve.populationSize, populationRng(7));
    const b = initialFigures(7, config.evolve.populationSize, populationRng(7));
    expect(a.length).toBe(config.evolve.populationSize);
    expect(Array.from(a[0]!)).toEqual(Array.from(seedToFigure(7))); // the displayed seed IS in the search
    for (let k = 0; k < a.length; k++) {
      expect(Array.from(a[k]!)).toEqual(Array.from(b[k]!));
    }
    // different seed → different random slots
    const c = initialFigures(8, config.evolve.populationSize, populationRng(8));
    expect(Array.from(c[1]!)).not.toEqual(Array.from(a[1]!));
  });

  it('randomFigure stays in the init box; mutateFigure perturbs deterministically', () => {
    const rng = mulberry32(3);
    const f = randomFigure(rng);
    expect(f.length).toBe(N_PARAMS);
    for (const x of f) {
      expect(x).toBeGreaterThanOrEqual(config.figureInit.min);
      expect(x).toBeLessThanOrEqual(config.figureInit.max);
    }
    const m1 = mutateFigure(f, 5, mulberry32(9));
    const m2 = mutateFigure(f, 5, mulberry32(9));
    expect(Array.from(m1)).toEqual(Array.from(m2)); // same rng seed → same mutation
    expect(Array.from(m1)).not.toEqual(Array.from(f)); // but it did perturb
  });
});

describe('evolve: the fresh/mutant replacement schedule', () => {
  const kinds = (n: number, frac: number): boolean[] =>
    Array.from({ length: n }, (_, i) => isMutantRestart(i, frac));

  it('fraction 0.5 alternates fresh, mutant, fresh, … (both kinds occur at any budget ≥ 2)', () => {
    expect(kinds(6, 0.5)).toEqual([false, true, false, true, false, true]);
  });

  it('fraction 0 → all fresh; fraction 1 → all mutants', () => {
    expect(kinds(8, 0)).toEqual(new Array(8).fill(false));
    expect(kinds(8, 1)).toEqual(new Array(8).fill(true));
  });

  it('any fraction: exactly ⌊n·frac⌋ mutants in the first n replacements (quota is exact)', () => {
    for (const frac of [0.25, 1 / 3, 0.5, 0.7]) {
      for (const n of [1, 3, 8, 20]) {
        const mutants = kinds(n, frac).filter(Boolean).length;
        expect(mutants, `frac=${frac} n=${n}`).toBe(Math.floor(n * frac));
      }
    }
  });
});
