// src/optim/evolve.ts
//
// The outer multi-start layer (CONCEPT.md §9; optimizer v2 "let each evolution play out"). v2 has
// NO generations, NO culling, NO champion adoption: the session runs populationSize independent
// trajectories and, when one plays out (plateau or cap), freezes it as an endpoint and starts a
// replacement in the freed slot. This module supplies the trajectory START POINTS — the seeded
// initial slots, fresh random restarts, mutations of the best endpoint — and the deterministic
// fresh/mutant replacement schedule. All randomness flows through the seeded Rng (src/core/rng.ts)
// for reproducibility.

import { config, type Config, N_PARAMS } from '../config';
import type { Figure } from '../core/figure';
import { seedToFigure, cloneFigure } from '../core/figure';
import { mulberry32, uniform, gaussian, type Rng } from '../core/rng';

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

/** Deterministic Rng for a session's outer search (decorrelated from the figure seed's own stream). */
export function populationRng(figureSeed: number): Rng {
  return mulberry32((figureSeed ^ 0x5bd1e995) >>> 0);
}

/**
 * Initial trajectory start points: slot 0 is the figure seed's canonical figure (so the displayed
 * seed is in the search); the rest are fresh random restarts drawn from the session Rng.
 */
export function initialFigures(
  figureSeed: number,
  size: number,
  rng: Rng,
  cfg: Config = config,
): Figure[] {
  const figs: Figure[] = [seedToFigure(figureSeed, cfg)];
  for (let k = 1; k < size; k++) figs.push(randomFigure(rng, cfg));
  return figs;
}

/**
 * Deterministic replacement schedule: replacement index i (0-based) is a MUTANT of the best
 * endpoint exactly when the running mutant count falls behind the `mutateFraction` quota —
 * ⌊(i+1)·frac⌋ > ⌊i·frac⌋, i.e. the first ⌊n·frac⌋ mutants are spread evenly through n restarts.
 * frac 0.5 alternates fresh, mutant, fresh, mutant, …; frac 0 = all fresh; frac 1 = all mutants.
 */
export function isMutantRestart(i: number, mutateFraction: number): boolean {
  return Math.floor((i + 1) * mutateFraction) > Math.floor(i * mutateFraction);
}
