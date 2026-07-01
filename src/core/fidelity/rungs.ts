// src/core/fidelity/rungs.ts
//
// The registered rungs, their weights, and the height-cap by DATA scale type (CONCEPT.md §6).
// "Ladder height is set by the DATA, never the figure": the rungs scored for a data relation are
// exactly those whose own scale type ≤ the data relation's scale type.
//   • sales → ratio data  → 3 rungs (ordinal ⊂ interval ⊂ ratio), max w_ord + w_int + w_ratio
//   • order → ordinal data → 1 rung (ordinal), max w_ord
// The figure may over-provide structure harmlessly; the data can never grant a rung it lacks.

import { Value, val, add, mul } from '../autograd/engine';
import { ScaleType, scaleLeq } from '../scale';
import type { Config } from '../../config';
import { fOrd, fInt, fRatio, fOrdExact, fIntExact, fRatioExact } from './ladder';

export type RungName = 'ord' | 'int' | 'ratio';

export interface Rung {
  readonly name: RungName;
  /** The rung's own scale type (used for the height-cap comparison). */
  readonly scaleType: ScaleType;
  weight(cfg: Config): number;
  fDiff(c: Value[], v: Value[], cfg: Config): Value;
  fExact(c: ArrayLike<number>, v: ArrayLike<number>, cfg: Config): number;
}

export const ORD_RUNG: Rung = {
  name: 'ord',
  scaleType: ScaleType.Ordinal,
  weight: (cfg) => cfg.weights.w_ord,
  fDiff: (c, v, cfg) => fOrd(c, v, cfg.T, cfg.eps.corrVar),
  fExact: (c, v) => fOrdExact(c, v),
};

export const INT_RUNG: Rung = {
  name: 'int',
  scaleType: ScaleType.Interval,
  weight: (cfg) => cfg.weights.w_int,
  fDiff: (c, v, cfg) => fInt(c, v, cfg.eps.corrVar),
  fExact: (c, v) => fIntExact(c, v),
};

export const RATIO_RUNG: Rung = {
  name: 'ratio',
  scaleType: ScaleType.Ratio,
  weight: (cfg) => cfg.weights.w_ratio,
  fDiff: (c, v, cfg) => fRatio(c, v, cfg.sigma0Sq),
  fExact: (c, v, cfg) => fRatioExact(c, v, cfg.sigma0Sq),
};

/** The registry, in ascending strictness. */
export const RUNGS: readonly Rung[] = [ORD_RUNG, INT_RUNG, RATIO_RUNG];

/** The rungs scored for a data relation of the given scale type (height-cap by the DATA). */
export function rungsForData(dataType: ScaleType): Rung[] {
  return RUNGS.filter((r) => scaleLeq(r.scaleType, dataType));
}

/** The maximum attainable reward for a relation of the given data type (all its rungs perfect). */
export function maxRewardFor(dataType: ScaleType, cfg: Config): number {
  return rungsForData(dataType).reduce((s, r) => s + r.weight(cfg), 0);
}

export interface RungValue {
  name: RungName;
  f: Value; // the differentiable fidelity ∈ [0,1]
}

export interface RewardValue {
  total: Value; // Σ w_rung · F_rung
  rungs: RungValue[];
}

/**
 * Differentiable reward for one assigned relation: the carrier's 12-vector c (Value[]) against the
 * data vector v (Value[] of constants), height-capped by dataType.
 */
export function rewardValue(
  c: Value[],
  v: Value[],
  dataType: ScaleType,
  cfg: Config,
): RewardValue {
  const rs = rungsForData(dataType);
  let total: Value = val(0);
  const rungs: RungValue[] = [];
  for (const r of rs) {
    const f = r.fDiff(c, v, cfg);
    total = add(total, mul(val(r.weight(cfg)), f));
    rungs.push({ name: r.name, f });
  }
  return { total, rungs };
}

export interface RungExact {
  name: RungName;
  f: number;
}

export interface RewardExact {
  total: number;
  rungs: RungExact[];
}

/** Exact reward (display path): same composition, exact per-rung fidelities. */
export function rewardExact(
  c: ArrayLike<number>,
  v: ArrayLike<number>,
  dataType: ScaleType,
  cfg: Config,
): RewardExact {
  const rs = rungsForData(dataType);
  let total = 0;
  const rungs: RungExact[] = [];
  for (const r of rs) {
    const f = r.fExact(c, v, cfg);
    total += r.weight(cfg) * f;
    rungs.push({ name: r.name, f });
  }
  return { total, rungs };
}
