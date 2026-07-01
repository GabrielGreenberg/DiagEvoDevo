// src/optim/evolve.ts
//
// The outer search layer (CONCEPT.md §9): random restarts + mutation for the global structure the
// smooth gradient cannot supply — above all, getting the ORDERING right (the ordinal surrogate is flat
// inside a correct ordering, so Adam alone stalls at wrong orderings). A population of parallel Adam
// trajectories; each generation culls the worst members and replaces them with fresh random restarts or
// mutations of the current best. All randomness flows through the seeded Rng for reproducibility.

import { config, type Config, N_PARAMS } from '../config';
import type { Figure } from '../core/figure';
import { seedToFigure, cloneFigure } from '../core/figure';
import { mulberry32, uniform, gaussian, type Rng } from '../core/rng';
import { initAdam, type AdamState } from './gd';

export interface Member {
  figure: Figure;
  adam: AdamState;
  score: number;
}

export interface Population {
  members: Member[];
  generation: number;
}

/** A fresh random figure (uniform in the init box) drawn from an Rng. */
export function randomFigure(rng: Rng, cfg: Config = config): Figure {
  const f = new Float64Array(N_PARAMS);
  for (let i = 0; i < N_PARAMS; i++) f[i] = uniform(rng, cfg.figureInit.min, cfg.figureInit.max);
  return f;
}

/** Gaussian mutation: add N(0, sigma) to every coordinate. */
export function mutateFigure(figure: Figure, sigma: number, rng: Rng): Figure {
  const f = cloneFigure(figure);
  for (let i = 0; i < f.length; i++) f[i] = f[i]! + gaussian(rng, 0, sigma);
  return f;
}

/** Deterministic Rng for a population (decorrelated from the figure seed's own stream). */
export function populationRng(figureSeed: number): Rng {
  return mulberry32((figureSeed ^ 0x5bd1e995) >>> 0);
}

/**
 * Initial population: member 0 is the figure seed's canonical figure (so the displayed seed is in the
 * search); the rest are fresh random restarts.
 */
export function initPopulation(
  figureSeed: number,
  size: number = config.evolve.populationSize,
  cfg: Config = config,
): { pop: Population; rng: Rng } {
  const rng = populationRng(figureSeed);
  const members: Member[] = [];
  members.push({ figure: seedToFigure(figureSeed, cfg), adam: initAdam(), score: -Infinity });
  for (let k = 1; k < size; k++) {
    members.push({ figure: randomFigure(rng, cfg), adam: initAdam(), score: -Infinity });
  }
  return { pop: { members, generation: 0 }, rng };
}

const finite = (x: number): number => (Number.isFinite(x) ? x : -Infinity);

/**
 * One outer generation: re-score all members, keep the top half, and replace the bottom half with a
 * mix of fresh random restarts and mutations of top members (Adam state reset for the replacements).
 */
export function evolveStep(
  pop: Population,
  evalScore: (f: Figure) => number,
  rng: Rng,
  cfg: Config = config,
): Population {
  for (const m of pop.members) m.score = finite(evalScore(m.figure));
  pop.members.sort((a, b) => b.score - a.score);
  const size = pop.members.length;
  const keep = Math.max(1, Math.ceil(size / 2));
  const sigmaAbs = cfg.evolve.mutationSigma * (cfg.figureInit.max - cfg.figureInit.min);
  for (let k = keep; k < size; k++) {
    if ((k - keep) % 2 === 0) {
      pop.members[k] = { figure: randomFigure(rng, cfg), adam: initAdam(), score: -Infinity };
    } else {
      const parent = pop.members[(k - keep) % keep]!;
      pop.members[k] = {
        figure: mutateFigure(parent.figure, sigmaAbs, rng),
        adam: initAdam(),
        score: -Infinity,
      };
    }
  }
  pop.generation += 1;
  return pop;
}

/** The best (highest-scoring) member. */
export function bestMember(pop: Population): Member {
  let best = pop.members[0]!;
  for (const m of pop.members) if (finite(m.score) > finite(best.score)) best = m;
  return best;
}
