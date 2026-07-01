// src/core/score.ts
//
// The total score: S = reward(assignment) − Σ penalties (CONCEPT.md §§6,8). Two paths:
//   • scoreValue — differentiable (over the 48 Value leaves), the optimizer's objective.
//   • scoreExact — plain numbers with a full per-rung / per-penalty breakdown, for the score panel.
// The only value-difference between the paths is the ordinal rung (surrogate vs Kendall τ).

import { Value, val, add, sub } from './autograd/engine';
import { config, type Config } from '../config';
import type { DataSet } from './data';
import type { Figure } from './figure';
import type { Page, PositedFrame } from './frame';
import { pageFromConfig, frameFromConfig } from './frame';
import type { ScaleType } from './scale';
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
  makeContext,
  type AssignmentMap,
  type AssignmentPolicy,
} from './assignment';

// ── differentiable path ─────────────────────────────────────────────────────────

export interface ScoreValue {
  total: Value; // reward − penalty
  reward: Value;
  penalty: Value;
}

function penaltyContext(
  data: DataSet,
  map: AssignmentMap,
  cfg: Config,
  frame: PositedFrame,
  page: Page,
): PenaltyContext {
  return { map, registry: REGISTRY, frame, page, data, cfg };
}

export function scoreValue(
  leaves: Value[],
  data: DataSet,
  map: AssignmentMap,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): ScoreValue {
  let reward: Value = val(0);
  for (const rel of dataRelations(data)) {
    const id = map.get(rel.key)!;
    const c = getMeasurement(id).extractValue(leaves, frame, page);
    const v = Array.from(rel.datavec, (x) => val(x));
    reward = add(reward, rewardValue(c, v, rel.type, cfg).total);
  }
  const penalty = totalPenaltyValue(leaves, penaltyContext(data, map, cfg, frame, page)).total;
  return { total: sub(reward, penalty), reward, penalty };
}

// ── exact path (display) ──────────────────────────────────────────────────────────

export interface AssignedBreakdown {
  key: 'sales' | 'order';
  measurementId: string;
  dataType: ScaleType;
  reward: number;
  rungs: { name: RungName; f: number }[];
}

export interface Breakdown {
  total: number; // reward − penalty
  reward: number;
  penalty: number;
  maxReward: number; // Σ maxRewardFor(relation) — the attainable reward ceiling
  quality: number; // reward / maxReward ∈ [0,1]
  assignments: AssignedBreakdown[];
  penalties: PenaltyTermExact[];
}

/** Reward-only, exact, for a fixed figure and map (the argmax objective for BestAssignment). */
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

export function scoreExact(
  figure: Figure,
  data: DataSet,
  map: AssignmentMap,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): Breakdown {
  const assignments: AssignedBreakdown[] = [];
  let reward = 0;
  let maxReward = 0;
  for (const rel of dataRelations(data)) {
    const id = map.get(rel.key)!;
    const m = getMeasurement(id);
    const re = rewardExact(m.extract(figure, frame, page), rel.datavec, rel.type, cfg);
    reward += re.total;
    maxReward += maxRewardFor(rel.type, cfg);
    assignments.push({
      key: rel.key,
      measurementId: id,
      dataType: rel.type,
      reward: re.total,
      rungs: re.rungs,
    });
  }
  const pen = totalPenaltyExact(figure, penaltyContext(data, map, cfg, frame, page));
  const total = reward - pen.total;
  return {
    total,
    reward,
    penalty: pen.total,
    maxReward,
    quality: maxReward > 0 ? reward / maxReward : 0,
    assignments,
    penalties: pen.terms,
  };
}

/**
 * Resolve the assignment for a figure under a policy (FixedAssignment ignores the figure;
 * BestAssignment argmaxes reward over legal maps). This is the seam M5/M6 use each step.
 */
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
