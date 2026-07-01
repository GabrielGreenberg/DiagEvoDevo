// src/optim/converge.ts
//
// Convergence detection on the SCORE plateau, not parameter fixity (CONCEPT.md §9). The optimum is a
// VALLEY: the score is invariant to overall scale k and horizontal translation/spacing, so parameters
// keep drifting along the valley floor forever even after the score has settled. We watch the trailing
// score window's spread (max−min); a genuine slow climb keeps it above plateauEps, only a true flat
// valley collapses it. minSteps guards against an early-flat false positive; maxSteps is a hard cap.

import { config } from '../config';

export interface ConvergenceState {
  window: number[]; // ring buffer of the last windowSize scores
  step: number;
  converged: boolean;
  byCap: boolean; // true if we stopped at maxSteps rather than a genuine plateau
}

export function initConvergence(): ConvergenceState {
  return { window: [], step: 0, converged: false, byCap: false };
}

/**
 * Push the newest score; return whether we have converged.
 * Converged ⇔ step ≥ minSteps ∧ window full ∧ (max(window) − min(window)) ≤ plateauEps.
 * Fires on a score plateau even while parameters still drift along the invariant valley.
 */
export function pushScore(
  state: ConvergenceState,
  score: number,
  cfg = config.converge,
): boolean {
  if (state.converged) return true;
  state.step += 1;
  state.window.push(score);
  if (state.window.length > cfg.windowSize) state.window.shift();

  if (state.step >= cfg.maxSteps) {
    state.converged = true;
    state.byCap = true;
    return true;
  }
  if (state.step < cfg.minSteps) return false;
  if (state.window.length < cfg.windowSize) return false;

  let mn = Infinity;
  let mx = -Infinity;
  let sum = 0;
  for (const s of state.window) {
    if (s < mn) mn = s;
    if (s > mx) mx = s;
    sum += s;
  }
  // RELATIVE plateau: the window's spread as a fraction of its mean magnitude. Relative (not absolute)
  // so it adapts to the score scale — comprehensive scoring runs at ~10²·(fixed-mode scale). Also accept
  // an absolute floor for scores near zero.
  const mean = Math.abs(sum / state.window.length);
  const spread = mx - mn;
  if (spread <= cfg.plateauEps || spread / (mean + 1e-9) <= cfg.plateauRelEps) {
    state.converged = true;
    return true;
  }
  return false;
}
