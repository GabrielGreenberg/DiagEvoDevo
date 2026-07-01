// src/core/score.ts
//
// The total score: S = reward − Σ penalties (CONCEPT.md §§6,8).
//
// COMPREHENSIVE (default) scoring realizes the full-matrix homomorphism: each data relation is compared
// against EVERY commensurable measurement, like-with-like (CONCEPT §5), and the contributions are SUMMED.
// A figure that makes MANY geometric relations track the data scores higher than one that makes few — so
// diagram kinds emerge as the configurations that satisfy the most of the matrix at once.
//   • sales (ratio)  → all measurements with stamp ≥ ratio  (the 15 ratio + 5 cyclic = 20), 3-rung ladder
//   • order (ordinal)→ all measurements with stamp ≥ ordinal (all 26), ordinal rung
// FIXED scoring (config.scoring = 'fixed') collapses each relation to a single configured carrier — the
// earlier bar-chart-only model — kept as a swappable mode.
//
// Two paths: scoreValue (differentiable, the optimizer's objective) and scoreExact (plain numbers + a
// per-relation / per-measurement breakdown for the panel). The only value-fork is the ordinal rung
// (logistic surrogate vs exact Kendall τ).

import { Value, val, add, sub, div } from './autograd/engine';
import { config, type Config } from '../config';
import type { DataSet } from './data';
import type { Figure } from './figure';
import type { Page, PositedFrame } from './frame';
import { pageFromConfig, frameFromConfig } from './frame';
import type { ScaleType } from './scale';
import type { Measurement } from './measurements/types';
import { getMeasurement, REGISTRY } from './measurements/registry';
import { rewardValue, rewardExact, maxRewardFor, type RungName } from './fidelity/rungs';
import {
  totalPenaltyValue,
  totalPenaltyExact,
  type PenaltyContext,
  type PenaltyTermExact,
} from './penalties/registry';
import {
  dataRelations,
  legalCandidates,
  makeContext,
  type DataRelation,
  type AssignmentMap,
  type AssignmentPolicy,
} from './assignment';

/** The measurements a relation is scored against, per the scoring mode. */
export function measurementsFor(rel: DataRelation, cfg: Config = config): Measurement[] {
  if (cfg.scoring === 'fixed') {
    const id = cfg.fixedCarriers[rel.key];
    return [getMeasurement(id)];
  }
  return legalCandidates(rel, REGISTRY); // comprehensive: the full commensurable matrix
}

/** A reference single-carrier map, so the (zero-weighted) penalties compute sanely in any mode. */
function referenceMap(cfg: Config): AssignmentMap {
  return new Map([
    ['sales', cfg.fixedCarriers.sales],
    ['order', cfg.fixedCarriers.order],
  ]);
}

function penaltyContext(data: DataSet, cfg: Config, frame: PositedFrame, page: Page): PenaltyContext {
  return { map: referenceMap(cfg), registry: REGISTRY, frame, page, data, cfg };
}

// ── differentiable path ─────────────────────────────────────────────────────────

export interface ScoreValue {
  total: Value; // reward − penalty
  reward: Value;
  penalty: Value;
}

export function scoreValue(
  leaves: Value[],
  data: DataSet,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): ScoreValue {
  // PER-RELATION NORMALIZED sum: each relation contributes relSum / relMax ∈ [0,1], so relations with
  // more (or richer) commensurable measurements don't drown the others. Within a relation, matching
  // more measurements still raises relSum. Total ∈ [0, #relations].
  let reward: Value = val(0);
  for (const rel of dataRelations(data)) {
    const v = Array.from(rel.datavec, (x) => val(x));
    const ms = measurementsFor(rel, cfg);
    const relMax = ms.length * maxRewardFor(rel.type, cfg);
    let relSum: Value = val(0);
    for (const m of ms) {
      const c = m.extractValue(leaves, frame, page);
      relSum = add(relSum, rewardValue(c, v, rel.type, cfg).total);
    }
    reward = add(reward, div(relSum, val(relMax || 1)));
  }
  const penalty = totalPenaltyValue(leaves, penaltyContext(data, cfg, frame, page)).total;
  return { total: sub(reward, penalty), reward, penalty };
}

// ── exact path (display) ──────────────────────────────────────────────────────────

export interface MeasurementScore {
  id: string;
  stamp: ScaleType;
  reward: number; // this measurement's contribution
  rungs: { name: RungName; f: number }[];
}

export interface RelationBreakdown {
  key: 'sales' | 'order';
  dataType: ScaleType;
  reward: number; // Σ over the relation's measurements (raw)
  maxReward: number; // count × max-rung-reward (the relation's attainable ceiling)
  normalized: number; // reward / maxReward ∈ [0,1] — this relation's contribution to the total
  measurements: MeasurementScore[]; // sorted by reward, best first
}

export interface Breakdown {
  total: number; // reward − penalty
  reward: number; // Σ over relations of (relReward / relMax) ∈ [0, #relations]
  penalty: number;
  maxReward: number; // #relations (each normalized relation contributes ≤ 1)
  quality: number; // reward / maxReward ∈ [0,1]
  relations: RelationBreakdown[];
  penalties: PenaltyTermExact[];
}

export function scoreExact(
  figure: Figure,
  data: DataSet,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): Breakdown {
  const relations: RelationBreakdown[] = [];
  let reward = 0; // Σ normalized relation contributions
  for (const rel of dataRelations(data)) {
    const ms = measurementsFor(rel, cfg);
    const maxRung = maxRewardFor(rel.type, cfg);
    const measurements: MeasurementScore[] = [];
    let relReward = 0;
    for (const m of ms) {
      const re = rewardExact(m.extract(figure, frame, page), rel.datavec, rel.type, cfg);
      relReward += re.total;
      measurements.push({ id: m.id, stamp: m.stamp, reward: re.total, rungs: re.rungs });
    }
    measurements.sort((a, b) => b.reward - a.reward);
    const relMax = ms.length * maxRung || 1;
    const normalized = relReward / relMax;
    relations.push({ key: rel.key, dataType: rel.type, reward: relReward, maxReward: relMax, normalized, measurements });
    reward += normalized;
  }
  const maxReward = relations.length; // each relation contributes ≤ 1
  const pen = totalPenaltyExact(figure, penaltyContext(data, cfg, frame, page));
  const total = reward - pen.total;
  return {
    total,
    reward,
    penalty: pen.total,
    maxReward,
    quality: maxReward > 0 ? reward / maxReward : 0,
    relations,
    penalties: pen.terms,
  };
}

// ── single-assignment helpers (for the 'fixed'/'best' assignment policies — CONCEPT §7 invention) ──

/** Reward-only, exact, for a fixed figure and a SINGLE-carrier map (the argmax objective). */
export function rewardOf(
  figure: Figure,
  data: DataSet,
  map: AssignmentMap,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): number {
  let total = 0;
  for (const rel of dataRelations(data)) {
    const id = map.get(rel.key);
    if (id === undefined) continue;
    const m = REGISTRY.get(id);
    if (!m) continue;
    total += rewardExact(m.extract(figure, frame, page), rel.datavec, rel.type, cfg).total;
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
