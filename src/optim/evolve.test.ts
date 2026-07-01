// src/optim/evolve.test.ts — M6 gate for the evolution / restart layer.

import { describe, it, expect } from 'vitest';
import {
  initPopulation,
  evolveStep,
  mutateFigure,
  randomFigure,
  bestMember,
  populationRng,
} from './evolve';
import { mulberry32 } from '../core/rng';
import { config, N_PARAMS } from '../config';
import type { Figure } from '../core/figure';

describe('evolve: reproducibility', () => {
  it('initPopulation is deterministic from the figure seed', () => {
    const a = initPopulation(7).pop;
    const b = initPopulation(7).pop;
    expect(a.members.length).toBe(config.evolve.populationSize);
    for (let k = 0; k < a.members.length; k++) {
      expect(Array.from(a.members[k]!.figure)).toEqual(Array.from(b.members[k]!.figure));
    }
    // different seed → different population
    expect(Array.from(initPopulation(8).pop.members[1]!.figure)).not.toEqual(
      Array.from(a.members[1]!.figure),
    );
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

describe('evolve: a generation keeps the best and replaces the worst', () => {
  it('best score is non-decreasing across a generation (elitism on the top half)', () => {
    // score = −Σx² : the "best" figure is the one closest to the origin
    const evalScore = (f: Figure): number => -f.reduce((s, x) => s + x * x, 0);
    const { pop } = initPopulation(5);
    const rng = populationRng(5);
    for (const m of pop.members) m.score = evalScore(m.figure);
    const before = bestMember(pop).score;
    evolveStep(pop, evalScore, rng);
    const after = bestMember(pop).score;
    expect(after).toBeGreaterThanOrEqual(before); // top half preserved, so best cannot get worse
    expect(pop.generation).toBe(1);
  });
});
