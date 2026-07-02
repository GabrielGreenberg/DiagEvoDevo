// src/core/score.ts
//
// The total score v2 (CONCEPT.md §§6,8; handoffs/2026-07-01-scoring-v2-design.md):
//
//   cell   q_m(R) = salience(c_m) · Σ_rungs w_r·F_r(c_m, v_R) / maxRung(R)      ∈ [0,1]
//   relation(R)   = (1/β) · log( mean_m exp(β·q_m(R)) )                          ∈ [0,1]  (LSE)
//   reward        = Σ_R relation(R)                                              ∈ [0, #relations]
//   penalty       = w_ink · mean_m [ salience(c_m)·(1 − smoothmax_R q_m(R)) ] + other registered terms
//   S             = reward − penalty ;   quality = reward / #relations
//
// with m ranging over the DEDUPED distinct carriers (measurements/registry.carriers), each extracted
// exactly ONCE per eval and reused across relations. The LSE replaces v1's flat sum (audit: linear
// summing made "everything ∝ value" mush the optimum); salience is the reader-resolution gate
// (sub-legible carriers earn ~0 and aren't worth ink); the data-ink term charges for salient
// variation that carries nothing.
//
// FIXED scoring (config.scoring = 'fixed') collapses each relation to its single configured carrier,
// scored with the SAME v2 ladder + salience (LSE over one cell = the cell) — kept for comparability.
//
// Two paths: scoreValue (differentiable, the optimizer's objective) and scoreExact (plain numbers +
// the per-relation / per-carrier breakdown for the panel). The only deliberate value-fork is the
// ordinal rung (legibility-floored logistic surrogate vs exact Kendall τ).

import { Value, val, add, sub, mul, div } from './autograd/engine';
import { variance } from './autograd/ops';
import { varianceN } from './statsN';
import { config, type Config } from '../config';
import type { DataSet } from './data';
import type { Figure } from './figure';
import type { Page, PositedFrame } from './frame';
import { pageFromConfig, frameFromConfig } from './frame';
import { commensurability } from './scale';
import type { ScaleType } from './scale';
import { REGISTRY, carriers, carrierFor, type Carrier } from './measurements/registry';
import {
  rewardValue,
  rewardExact,
  maxRewardFor,
  thetaFor,
  type RungName,
} from './fidelity/rungs';
import { lseMean, lseMeanN, fOrdExact } from './fidelity/ladder';
import {
  totalPenaltyValue,
  totalPenaltyExact,
  type PenaltyContext,
  type PenaltyTermExact,
  type CellQValue,
  type CellQExact,
} from './penalties/registry';
import {
  dataRelations,
  makeContext,
  type DataRelation,
  type AssignmentMap,
  type AssignmentPolicy,
} from './assignment';

/** The distinct carriers a relation is scored against, per the scoring mode. */
export function carriersFor(rel: DataRelation, all: readonly Carrier[], cfg: Config = config): Carrier[] {
  if (cfg.scoring === 'fixed') {
    return [carrierFor(cfg.fixedCarriers[rel.key], all)];
  }
  return all.filter((c) => commensurability(rel.type, c.stamp)); // comprehensive: the deduped matrix
}

/** A reference single-carrier map, so map-based penalties (economy) compute sanely in any mode. */
function referenceMap(cfg: Config): AssignmentMap {
  return new Map([
    ['sales', cfg.fixedCarriers.sales],
    ['order', cfg.fixedCarriers.order],
  ]);
}

// ── salience (CONCEPT §6 v2: the reader-resolution gate) ────────────────────────

/** s(c) = Var(c)/(Var(c)+θ²), differentiable. θ per the carrier's unit class. */
function salienceValue(c: Value[], theta: number): Value {
  const v = variance(c);
  return div(v, add(v, val(theta * theta)));
}

/** Exact twin. */
function salienceExact(c: ArrayLike<number>, theta: number): number {
  const v = varianceN(c);
  return v / (v + theta * theta);
}

// ── differentiable path ─────────────────────────────────────────────────────────

export interface ScoreValue {
  total: Value; // reward − penalty
  reward: Value;
  penalty: Value;
}

interface CellStateValue {
  carrier: Carrier;
  c: Value[];
  salience: Value;
  q: Map<string, Value>; // relation key → cell
}

export function scoreValue(
  leaves: Value[],
  data: DataSet,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): ScoreValue {
  const all = carriers(cfg);
  const perRel = dataRelations(data).map((rel) => ({ rel, cands: carriersFor(rel, all, cfg) }));

  // Extract EVERY distinct carrier once (perf + single source of truth). The cell map runs over the
  // full deduped set M(cfg) — NOT just each relation's candidates — because the data-ink penalty is
  // defined as mean_m over M(cfg) (spec): in FIXED mode the unassigned carriers must still pay for
  // salient meaningless variation (their q map stays empty ⇒ ink = salience·(1−0)). Relation LSEs
  // still run over the candidate subset only.
  const cells = new Map<string, CellStateValue>();
  for (const car of all) {
    const c = car.measurement.extractValue(leaves, frame, page);
    cells.set(car.id, {
      carrier: car,
      c,
      salience: salienceValue(c, thetaFor(car.unitClass, cfg)),
      q: new Map(),
    });
  }

  let reward: Value = val(0);
  for (const { rel, cands } of perRel) {
    const v = Array.from(rel.datavec, (x) => val(x));
    const maxRung = maxRewardFor(rel.type, cfg) || 1;
    const qs: Value[] = [];
    for (const car of cands) {
      const cell = cells.get(car.id)!;
      const rw = rewardValue(cell.c, v, rel.type, cfg, car.unitClass);
      const q = mul(cell.salience, div(rw.total, val(maxRung)));
      cell.q.set(rel.key, q);
      qs.push(q);
    }
    reward = add(reward, lseMean(qs, cfg.aggregation.beta));
  }

  const cellQ: CellQValue[] = [...cells.values()].map((s) => ({
    id: s.carrier.id,
    salience: s.salience,
    q: s.q,
  }));
  const ctx: PenaltyContext = {
    map: referenceMap(cfg),
    registry: REGISTRY,
    frame,
    page,
    data,
    cfg,
    cells: cellQ,
  };
  const penalty = totalPenaltyValue(leaves, ctx).total;
  return { total: sub(reward, penalty), reward, penalty };
}

// ── exact path (display) ──────────────────────────────────────────────────────────

/** One carrier's row in a relation's breakdown (v2). `reward`/`measurements` names are kept so v1
 *  consumers (bench, panel) read q in the old units: reward = q·maxRung, frac = reward/maxRung = q. */
export interface CarrierScore {
  id: string;
  label: string;
  stamp: ScaleType;
  aliases: readonly string[];
  salience: number; // ∈ [0,1): the reader-resolution gate
  q: number; // salience-gated, rung-normalized cell ∈ [0,1]
  reward: number; // q · maxRung (v1-compatible units for panel/bench normalization)
  signedTau: number; // 2·fOrdExact − 1 ∈ [−1,1]: direction display (↑/↓) for this relation's data
  rungs: { name: RungName; f: number }[];
}

/** @deprecated v1 name — the cells are per distinct CARRIER now. */
export type MeasurementScore = CarrierScore;

export interface RelationBreakdown {
  key: 'sales' | 'order';
  dataType: ScaleType;
  aggregated: number; // the LSE ∈ [0,1] — this relation's contribution to the reward
  normalized: number; // = aggregated (v1 name kept for consumers)
  reward: number; // Σ_m q_m·maxRung (raw cell sum, v1-compatible display units)
  maxReward: number; // #carriers × maxRung (the v1 normalization ceiling for per-cell fracs)
  carriers: CarrierScore[]; // sorted by q, best first
  measurements: CarrierScore[]; // = carriers (deprecated v1 alias, same array)
}

export interface Breakdown {
  total: number; // reward − penalty
  reward: number; // Σ_R relation(R) ∈ [0, #relations]
  penalty: number;
  maxReward: number; // #relations (each LSE contributes ≤ 1)
  quality: number; // reward / maxReward ∈ [0,1] (~0 for random figures: chance floors removed)
  relations: RelationBreakdown[];
  penalties: PenaltyTermExact[];
  distinctCarriers: number; // deduped carrier count (16 under the v1 geometry)
  censusSize: number; // raw measurement census (26) — kept for the theory display
}

interface CellStateExact {
  carrier: Carrier;
  c: Float64Array;
  salience: number;
  q: Map<string, number>;
}

export function scoreExact(
  figure: Figure,
  data: DataSet,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): Breakdown {
  const all = carriers(cfg);
  const perRel = dataRelations(data).map((rel) => ({ rel, cands: carriersFor(rel, all, cfg) }));

  // Full deduped carrier set M(cfg), mirroring scoreValue (fixed mode: unassigned carriers still
  // enter the data-ink mean with an empty q map).
  const cells = new Map<string, CellStateExact>();
  for (const car of all) {
    const c = car.measurement.extract(figure, frame, page);
    cells.set(car.id, {
      carrier: car,
      c,
      salience: salienceExact(c, thetaFor(car.unitClass, cfg)),
      q: new Map(),
    });
  }

  const relations: RelationBreakdown[] = [];
  let reward = 0;
  for (const { rel, cands } of perRel) {
    const maxRung = maxRewardFor(rel.type, cfg) || 1;
    const rows: CarrierScore[] = [];
    const qs: number[] = [];
    let rawSum = 0;
    for (const car of cands) {
      const cell = cells.get(car.id)!;
      const re = rewardExact(cell.c, rel.datavec, rel.type, cfg, car.unitClass);
      const q = cell.salience * (re.total / maxRung);
      cell.q.set(rel.key, q);
      qs.push(q);
      rawSum += q * maxRung;
      rows.push({
        id: car.id,
        label: car.label,
        stamp: car.stamp,
        aliases: car.aliases,
        salience: cell.salience,
        q,
        reward: q * maxRung,
        signedTau: 2 * fOrdExact(cell.c, rel.datavec) - 1,
        rungs: re.rungs,
      });
    }
    rows.sort((a, b) => b.q - a.q);
    const aggregated = lseMeanN(qs, cfg.aggregation.beta);
    relations.push({
      key: rel.key,
      dataType: rel.type,
      aggregated,
      normalized: aggregated,
      reward: rawSum,
      maxReward: cands.length * maxRung || 1,
      carriers: rows,
      measurements: rows,
    });
    reward += aggregated;
  }

  const cellQ: CellQExact[] = [...cells.values()].map((s) => ({
    id: s.carrier.id,
    salience: s.salience,
    q: s.q,
  }));
  const ctx: PenaltyContext = {
    map: referenceMap(cfg),
    registry: REGISTRY,
    frame,
    page,
    data,
    cfg,
    cellsExact: cellQ,
  };
  const pen = totalPenaltyExact(figure, ctx);
  const maxReward = relations.length;
  return {
    total: reward - pen.total,
    reward,
    penalty: pen.total,
    maxReward,
    quality: maxReward > 0 ? reward / maxReward : 0,
    relations,
    penalties: pen.terms,
    distinctCarriers: all.length,
    censusSize: REGISTRY.size,
  };
}

// ── single-assignment helpers (for the 'fixed'/'best' assignment policies — CONCEPT §7 invention) ──

/** Reward-only, exact, for a fixed figure and a SINGLE-carrier map (the argmax objective).
 *  v2: each relation's single cell is scored with the same salience-gated, rung-normalized q. */
export function rewardOf(
  figure: Figure,
  data: DataSet,
  map: AssignmentMap,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): number {
  const all = carriers(cfg);
  let total = 0;
  for (const rel of dataRelations(data)) {
    const id = map.get(rel.key);
    if (id === undefined) continue;
    const car = carrierFor(id, all);
    const c = car.measurement.extract(figure, frame, page);
    const maxRung = maxRewardFor(rel.type, cfg) || 1;
    const re = rewardExact(c, rel.datavec, rel.type, cfg, car.unitClass);
    total += salienceExact(c, thetaFor(car.unitClass, cfg)) * (re.total / maxRung);
  }
  return total;
}

/** Resolve a single-carrier assignment under a policy (used by the 'fixed'/'best' modes). */
export function resolveAssignment(
  policy: AssignmentPolicy,
  data: DataSet,
  figure: Figure,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): AssignmentMap {
  const scoreOf = (map: AssignmentMap): number => rewardOf(figure, data, map, cfg, frame, page);
  const ctx = makeContext(data, figure, scoreOf, cfg, frame, page);
  return policy.choose(ctx);
}
