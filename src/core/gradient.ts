// src/core/gradient.ts
//
// Gradient wiring (M5): run the differentiable score over 48 fresh Value leaves in canonical order,
// call backward() once, and collect the 48 leaf grads into ∇S for the optimizer. The engine
// (core/autograd) does the differentiation; this module just plants the leaves and harvests the grads.
//
// The graph is rebuilt every call — at 48 params this is the clean choice: backward()'s whole-graph
// zeroing is trivially correct and there is no stale tape to manage.

import { val, backward, type Value } from './autograd/engine';
import { config, type Config, N_PARAMS } from '../config';
import type { DataSet } from './data';
import type { Figure } from './figure';
import type { Page, PositedFrame } from './frame';
import { pageFromConfig, frameFromConfig } from './frame';
import type { AssignmentMap } from './assignment';
import { scoreValue } from './score';

/** Plant the 48 figure coordinates as Value leaves, in the canonical flat index order. */
export function buildLeaves(figure: Figure): Value[] {
  const leaves: Value[] = new Array(figure.length);
  for (let i = 0; i < figure.length; i++) leaves[i] = val(figure[i]!);
  return leaves;
}

export interface ScoreGrad {
  score: number; // S = reward − penalty
  reward: number;
  penalty: number;
  grad: Float64Array; // ∇S, length 48, ascent direction
}

/**
 * Score + gradient for a fixed assignment map. Returns ∇S (48) such that a small +η·∇S step
 * INCREASES S (the score is a reward we maximize).
 */
export function gradScore(
  figure: Figure,
  data: DataSet,
  map: AssignmentMap,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): ScoreGrad {
  const leaves = buildLeaves(figure);
  const sv = scoreValue(leaves, data, map, cfg, frame, page);
  backward(sv.total);
  const grad = new Float64Array(N_PARAMS);
  for (let i = 0; i < N_PARAMS; i++) grad[i] = leaves[i]!.grad;
  return { score: sv.total.data, reward: sv.reward.data, penalty: sv.penalty.data, grad };
}

/** Score only (no gradient), via the differentiable path's forward value. */
export function scoreOnly(
  figure: Figure,
  data: DataSet,
  map: AssignmentMap,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): number {
  return scoreValue(buildLeaves(figure), data, map, cfg, frame, page).total.data;
}
