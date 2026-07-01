// src/core/penalties/registry.ts
//
// The penalty registry (CONCEPT.md §8). Total score is S = reward − Σ penalties. Penalties are
// first-class, registered terms with configurable weights defaulting to 0 — sewn in at the deepest
// level (Principle I) even while switched off. score.ts sums this registry unchanged.

import type { Value } from '../autograd/engine';
import { val, add, mul } from '../autograd/engine';
import type { Config } from '../../config';
import type { Figure } from '../figure';
import type { Page, PositedFrame } from '../frame';
import type { DataSet } from '../data';
import type { AssignmentMap } from '../assignment';
import type { Measurement } from '../measurements/types';
import { spuriousness } from './spuriousness';
import { frozenDof } from './frozenDof';
import { economy } from './economy';

export type PenaltyName = 'spuriousness' | 'frozenDof' | 'economy';

export interface PenaltyContext {
  readonly map: AssignmentMap;
  readonly registry: ReadonlyMap<string, Measurement>;
  readonly frame: PositedFrame;
  readonly page: Page;
  readonly data: DataSet;
  readonly cfg: Config;
}

export interface Penalty {
  readonly name: PenaltyName;
  weight(cfg: Config): number;
  /** Differentiable penalty value ≥ 0 (over the Value leaves). */
  value(leaves: Value[], ctx: PenaltyContext): Value;
  /** Exact display value. */
  valueExact(figure: Figure, ctx: PenaltyContext): number;
}

/** The registered penalties. Order is display order; all default to weight 0. */
export const PENALTIES: readonly Penalty[] = [spuriousness, frozenDof, economy];

export interface PenaltyTermValue {
  name: PenaltyName;
  value: Value; // raw term value
  weight: number;
  weighted: Value; // weight · value
}

export function totalPenaltyValue(
  leaves: Value[],
  ctx: PenaltyContext,
): { total: Value; terms: PenaltyTermValue[] } {
  let total: Value = val(0);
  const terms: PenaltyTermValue[] = [];
  for (const p of PENALTIES) {
    const value = p.value(leaves, ctx);
    const weight = p.weight(ctx.cfg);
    const weighted = mul(val(weight), value);
    total = add(total, weighted);
    terms.push({ name: p.name, value, weight, weighted });
  }
  return { total, terms };
}

export interface PenaltyTermExact {
  name: PenaltyName;
  value: number;
  weight: number;
  weighted: number;
}

export function totalPenaltyExact(
  figure: Figure,
  ctx: PenaltyContext,
): { total: number; terms: PenaltyTermExact[] } {
  let total = 0;
  const terms: PenaltyTermExact[] = [];
  for (const p of PENALTIES) {
    const value = p.valueExact(figure, ctx);
    const weight = p.weight(ctx.cfg);
    const weighted = weight * value;
    total += weighted;
    terms.push({ name: p.name, value, weight, weighted });
  }
  return { total, terms };
}
