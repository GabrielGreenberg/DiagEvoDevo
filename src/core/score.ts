// src/core/score.ts
//
// The total score v2 (CONCEPT.md §§6,8; handoffs/2026-07-01-scoring-v2-design.md):
//
//   cell   q_m(R) = salience(c_m) · Σ_rungs w_r·F_r(c_m, v_R) / maxRung(R)      ∈ [0,1]
//   relation(R)   = (1/β) · log( mean_m exp(β·q_m(R)) )                          ∈ [0,1]  (LSE)
//                   (matchBonus=false: softmax-weighted mean instead — best carrier only)
//   reward        = Σ_R relation(R)                                              ∈ [0, #relations]
//   penalty       = w_ink · mean_m [ salience(c_m)·(1 − smoothmax_R q_m(R)) ] + other registered terms
//   bonus         = w_coin · Σ_R LSE_pairs[ eq(c_m1,c_m2) · q_m1^p · q_m2^p ]    (coincidence, §config)
//   S             = reward + bonus − penalty ;   quality = reward / #relations (bonus shown separately)
//
// with m ranging over the DEDUPED distinct carriers (measurements/registry.carriers), each extracted
// exactly ONCE per eval and reused across relations. The LSE replaces v1's flat sum (audit: linear
// summing made "everything ∝ value" mush the optimum); salience is the reader-resolution gate
// (sub-legible carriers earn ~0 and aren't worth ink); the data-ink term charges for salient
// variation that carries nothing.
//
// The COINCIDENCE bonus (config.bonuses.coincidence, 2026-07-02) rewards ARRANGED equality: pairs
// of a relation's commensurable carriers, same unit class, that the figure makes return the SAME
// number in the SAME page units (grounded vertical bars: end-y ≡ rise ≡ length). Pairs reuse the
// already-extracted carrier vectors and the already-computed cells q — no re-extraction — and eq is
// cached per carrier pair across relations (sales' pairs are a subset of order's). weight = 0 skips
// the term entirely: no pair nodes on the tape, total stays bit-exactly reward − penalty.
//
// FIXED scoring (config.scoring = 'fixed') collapses each relation to its single configured carrier,
// scored with the SAME v2 ladder + salience (LSE over one cell = the cell) — kept for comparability.
//
// Two paths: scoreValue (differentiable, the optimizer's objective) and scoreExact (plain numbers +
// the per-relation / per-carrier breakdown for the panel). The only deliberate value-fork is the
// ordinal rung (legibility-floored logistic surrogate vs exact Kendall τ).

import { Value, val, add, sub, mul, div, pow } from './autograd/engine';
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
import type { UnitClass } from './measurements/types';
import {
  rewardValue,
  rewardExact,
  maxRewardFor,
  thetaFor,
  type RungName,
} from './fidelity/rungs';
import {
  lseMean,
  lseMeanN,
  softmaxMean,
  softmaxMeanN,
  eqGauss,
  eqGaussN,
  fOrdExact,
} from './fidelity/ladder';
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

/** The distinct carriers a relation is scored against, per the scoring mode. May be EMPTY when the
 *  carrier toggles (cfg.carriers.disabled) exclude everything commensurable — the relation then
 *  contributes 0 reward (lseMean over the empty set is 0 by definition, no NaN), and quality keeps
 *  its #relations denominator: turning off everything value-readable honestly zeroes value. */
export function carriersFor(rel: DataRelation, all: readonly Carrier[], cfg: Config = config): Carrier[] {
  if (cfg.scoring === 'fixed') {
    return [carrierFor(cfg.fixedCarriers[rel.key], all)]; // toggles never remove a fixed carrier (registry guard)
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

// ── relation aggregation (config.aggregation.matchBonus) ───────────────────────

/** matchBonus=true: mean-form LSE (correlational doubling credited — strictly monotone);
 *  false: best-carrier-only softmax-weighted mean (see the config comment for its trade-offs). */
function aggregateValue(qs: Value[], cfg: Config): Value {
  return cfg.aggregation.matchBonus
    ? lseMean(qs, cfg.aggregation.beta)
    : softmaxMean(qs, cfg.aggregation.beta);
}

/** Exact twin of aggregateValue. */
function aggregateExact(qs: ArrayLike<number>, cfg: Config): number {
  return cfg.aggregation.matchBonus
    ? lseMeanN(qs, cfg.aggregation.beta)
    : softmaxMeanN(qs, cfg.aggregation.beta);
}

// ── coincidence bonus (config.bonuses.coincidence — see the file header) ───────

/** σ_eq for a unit class: ABSOLUTE page units for lengths/positions, radians for bearings. */
function sigmaEqFor(unit: UnitClass, cfg: Config): number {
  return unit === 'angle' ? cfg.bonuses.coincidence.sigmaEqAngle : cfg.bonuses.coincidence.sigmaEqLen;
}

/** Unordered-pair cache key: eq(c1,c2) depends only on the carrier pair, never on the relation
 *  (sales' candidate pairs are a subset of order's) — computed once per eval, reused. */
function pairKey(a: Carrier, b: Carrier): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

// ── differentiable path ─────────────────────────────────────────────────────────

export interface ScoreValue {
  total: Value; // reward + bonus − penalty (bonus term absent from the tape when its weight is 0)
  reward: Value;
  penalty: Value;
  /** The coincidence bonus w_coin·Σ_R relationCoin(R). A detached val(0) when the weight is 0. */
  bonus: Value;
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
    reward = add(reward, aggregateValue(qs, cfg));
  }

  // Coincidence bonus (file header; config.bonuses.coincidence): per relation, pairs of its
  // commensurable carriers with the SAME unit class, scored eq·qa^p·qb^p on the ALREADY-extracted
  // vectors and ALREADY-computed cells (no re-extraction), aggregated by the same mean-form LSE.
  // weight === 0 skips the block entirely — zero pair nodes on the tape, total root stays sub().
  const wCoin = cfg.bonuses.coincidence.weight;
  let bonus: Value = val(0);
  if (wCoin !== 0) {
    const p = cfg.bonuses.coincidence.fidelityGateP;
    const eqCache = new Map<string, Value>();
    let coinSum: Value = val(0);
    for (const { rel, cands } of perRel) {
      const pairScores: Value[] = [];
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
          const a = cands[i]!;
          const b = cands[j]!;
          if (a.unitClass !== b.unitClass) continue;
          const key = pairKey(a, b);
          let eq = eqCache.get(key);
          if (eq === undefined) {
            eq = eqGauss(cells.get(a.id)!.c, cells.get(b.id)!.c, sigmaEqFor(a.unitClass, cfg));
            eqCache.set(key, eq);
          }
          const qa = cells.get(a.id)!.q.get(rel.key)!;
          const qb = cells.get(b.id)!.q.get(rel.key)!;
          pairScores.push(mul(eq, mul(pow(qa, p), pow(qb, p))));
        }
      }
      if (pairScores.length > 0) coinSum = add(coinSum, lseMean(pairScores, cfg.aggregation.beta));
    }
    bonus = mul(val(wCoin), coinSum);
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
  const base = sub(reward, penalty);
  return { total: wCoin !== 0 ? add(base, bonus) : base, reward, penalty, bonus };
}

// ── exact path (display) ──────────────────────────────────────────────────────────

/** One carrier's row in a relation's breakdown (v2). */
export interface CarrierScore {
  id: string;
  label: string;
  stamp: ScaleType;
  aliases: readonly string[];
  salience: number; // ∈ [0,1): the reader-resolution gate
  q: number; // salience-gated, rung-normalized cell ∈ [0,1]
  signedTau: number; // 2·fOrdExact − 1 ∈ [−1,1]: direction display (↑/↓) for this relation's data
  rungs: { name: RungName; f: number }[];
}

export interface RelationBreakdown {
  key: 'sales' | 'order';
  dataType: ScaleType;
  aggregated: number; // the aggregate ∈ [0,1] (LSE; softmax mean when matchBonus=false) — this relation's reward share
  carriers: CarrierScore[]; // sorted by q, best first
}

/** One coincident carrier pair in a relation's coincidence breakdown. */
export interface CoincidencePair {
  key: string; // relation key
  a: string; // canonical carrier id
  b: string;
  aLabel: string;
  bLabel: string;
  eq: number; // equality kernel ∈ [0,1] (1 = same number in the same page units, per item)
  contribution: number; // pairScore = eq·qa^p·qb^p — this pair's entry in the relation's pair-LSE
}

/** The coincidence bonus breakdown (config.bonuses.coincidence). */
export interface BonusBreakdown {
  /** weight · Σ_R relationCoin — the term that enters `total`. 0 when the weight is 0. */
  coincidence: number;
  /** Per-relation pair-LSE ∈ [0,1] (unweighted). Empty when the term is disabled. */
  relationCoin: { key: string; value: number }[];
  /** Top pairs — ≤ 4 per relation, contribution > 0.01 only (display truncation; the LSE above
   *  runs over EVERY pair) — sorted by contribution, best first. */
  pairs: CoincidencePair[];
}

export interface Breakdown {
  total: number; // reward + bonuses.coincidence − penalty
  reward: number; // Σ_R relation(R) ∈ [0, #relations]
  penalty: number;
  maxReward: number; // #relations (each relation aggregate contributes ≤ 1)
  quality: number; // reward / maxReward ∈ [0,1] (~0 for random figures: chance floors removed; bonus EXCLUDED)
  relations: RelationBreakdown[];
  penalties: PenaltyTermExact[];
  bonuses: BonusBreakdown; // the coincidence term, shown separately from reward/quality
  distinctCarriers: number; // ACTIVE deduped carrier count (16 under the v1 geometry, minus toggles)
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
    for (const car of cands) {
      const cell = cells.get(car.id)!;
      const re = rewardExact(cell.c, rel.datavec, rel.type, cfg, car.unitClass);
      const q = cell.salience * (re.total / maxRung);
      cell.q.set(rel.key, q);
      qs.push(q);
      rows.push({
        id: car.id,
        label: car.label,
        stamp: car.stamp,
        aliases: car.aliases,
        salience: cell.salience,
        q,
        signedTau: 2 * fOrdExact(cell.c, rel.datavec) - 1,
        rungs: re.rungs,
      });
    }
    rows.sort((a, b) => b.q - a.q);
    const aggregated = aggregateExact(qs, cfg);
    relations.push({
      key: rel.key,
      dataType: rel.type,
      aggregated,
      carriers: rows,
    });
    reward += aggregated;
  }

  // Coincidence bonus — exact twin of the scoreValue block, plus the pair breakdown.
  const wCoin = cfg.bonuses.coincidence.weight;
  const bonuses: BonusBreakdown = { coincidence: 0, relationCoin: [], pairs: [] };
  if (wCoin !== 0) {
    const p = cfg.bonuses.coincidence.fidelityGateP;
    const eqCache = new Map<string, number>();
    let coinSum = 0;
    for (const { rel, cands } of perRel) {
      const pairScores: number[] = [];
      const pairRows: CoincidencePair[] = [];
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
          const a = cands[i]!;
          const b = cands[j]!;
          if (a.unitClass !== b.unitClass) continue;
          const key = pairKey(a, b);
          let eq = eqCache.get(key);
          if (eq === undefined) {
            eq = eqGaussN(cells.get(a.id)!.c, cells.get(b.id)!.c, sigmaEqFor(a.unitClass, cfg));
            eqCache.set(key, eq);
          }
          const qa = cells.get(a.id)!.q.get(rel.key)!;
          const qb = cells.get(b.id)!.q.get(rel.key)!;
          const contribution = eq * Math.pow(qa, p) * Math.pow(qb, p);
          pairScores.push(contribution);
          pairRows.push({
            key: rel.key,
            a: a.id,
            b: b.id,
            aLabel: a.label,
            bLabel: b.label,
            eq,
            contribution,
          });
        }
      }
      const value = lseMeanN(pairScores, cfg.aggregation.beta);
      bonuses.relationCoin.push({ key: rel.key, value });
      coinSum += value;
      // Display truncation only (the LSE above used every pair): top 4, contribution > 0.01.
      pairRows.sort((x, y) => y.contribution - x.contribution);
      for (const row of pairRows.slice(0, 4)) if (row.contribution > 0.01) bonuses.pairs.push(row);
    }
    bonuses.pairs.sort((x, y) => y.contribution - x.contribution);
    bonuses.coincidence = wCoin * coinSum;
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
  // Same float association as scoreValue: (reward − penalty) + bonus, bonus absent when w = 0.
  const base = reward - pen.total;
  return {
    total: wCoin !== 0 ? base + bonuses.coincidence : base,
    reward,
    penalty: pen.total,
    maxReward,
    quality: maxReward > 0 ? reward / maxReward : 0,
    relations,
    penalties: pen.terms,
    bonuses,
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
