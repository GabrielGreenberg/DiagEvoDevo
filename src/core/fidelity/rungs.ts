// src/core/fidelity/rungs.ts
//
// The registered rungs, their weights, and the height-cap by DATA scale type (CONCEPT.md §6).
// "Ladder height is set by the DATA, never the figure": the rungs scored for a data relation are
// exactly those whose own scale type ≤ the data relation's scale type.
//   • sales → ratio data  → 3 rungs (ordinal ⊂ interval ⊂ ratio), max w_ord + w_int + w_ratio
//   • order → ordinal data → 1 rung (ordinal), max w_ord
// The figure may over-provide structure harmlessly; the data can never grant a rung it lacks.
//
// v2: every rung form receives the CARRIER'S UNIT CLASS ('length' | 'angle') so unit-bearing
// parameters (the ordinal legibility spread floor) are read from the right config knob — page
// units for positions/lengths, radians for bearings.

import { Value, val, add, mul } from '../autograd/engine';
import { ScaleType, scaleLeq } from '../scale';
import type { Config } from '../../config';
import type { UnitClass } from '../measurements/types';
import { tauSym, fInt, fRatio, tauSymExact, fIntExact, fRatioExact } from './ladder';

export type RungName = 'ord' | 'int' | 'ratio';

/** The legibility spread floor for a carrier's unit class (CONCEPT §6 v2). */
export function spreadFloorFor(unit: UnitClass, cfg: Config): number {
  return unit === 'angle' ? cfg.legibility.spreadFloorAngle : cfg.legibility.spreadFloorLen;
}

/** The salience resolution θ for a carrier's unit class (CONCEPT §6 v2 reader model). */
export function thetaFor(unit: UnitClass, cfg: Config): number {
  return unit === 'angle' ? cfg.salience.thetaAngle : cfg.salience.thetaLen;
}

export interface Rung {
  readonly name: RungName;
  /** The rung's own scale type (used for the height-cap comparison). */
  readonly scaleType: ScaleType;
  weight(cfg: Config): number;
  fDiff(c: Value[], v: Value[], cfg: Config, unit: UnitClass): Value;
  fExact(c: ArrayLike<number>, v: ArrayLike<number>, cfg: Config, unit: UnitClass): number;
}

export const ORD_RUNG: Rung = {
  name: 'ord',
  scaleType: ScaleType.Ordinal,
  weight: (cfg) => cfg.weights.w_ord,
  // v2: the rung fidelity is τ_sym (chance-corrected, direction-symmetric), floored at the
  // carrier-unit legibility scale.
  fDiff: (c, v, cfg, unit) =>
    tauSym(c, v, cfg.T, spreadFloorFor(unit, cfg), cfg.eps.absSmooth, cfg.eps.corrVar),
  fExact: (c, v) => tauSymExact(c, v),
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
  // v2.1 signed-safe form: magnitude ∝ value AND coherent sign, per-entry v-implied normalization
  // (F_ratio = 1 exactly at c = ±k·v; no positivity clamp).
  fDiff: (c, v, cfg) =>
    fRatio(c, v, cfg.sigma0Sq, cfg.ratioSign.kappa, cfg.eps.length, cfg.eps.sigDenom, cfg.eps.absSmooth),
  fExact: (c, v, cfg) =>
    fRatioExact(c, v, cfg.sigma0Sq, cfg.ratioSign.kappa, cfg.eps.length, cfg.eps.sigDenom),
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
 * data vector v (Value[] of constants), height-capped by dataType, unit-parameterized by the
 * carrier's unit class.
 */
export function rewardValue(
  c: Value[],
  v: Value[],
  dataType: ScaleType,
  cfg: Config,
  unit: UnitClass,
): RewardValue {
  const rs = rungsForData(dataType);
  let total: Value = val(0);
  const rungs: RungValue[] = [];
  for (const r of rs) {
    const f = r.fDiff(c, v, cfg, unit);
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
  unit: UnitClass,
): RewardExact {
  const rs = rungsForData(dataType);
  let total = 0;
  const rungs: RungExact[] = [];
  for (const r of rs) {
    const f = r.fExact(c, v, cfg, unit);
    total += r.weight(cfg) * f;
    rungs.push({ name: r.name, f });
  }
  return { total, rungs };
}
