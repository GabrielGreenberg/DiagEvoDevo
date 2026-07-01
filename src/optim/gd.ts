// src/optim/gd.ts
//
// Adam stepper over the 48-vector. The score is a REWARD we MAXIMIZE, so this ASCENDS: θ += lr·m̂/(√v̂+ε).
// The sign convention lives here, in exactly one place. Adam is the local polisher — it has strong,
// smooth signal on the ratio/interval terms; the ordinal term is nearly flat inside a correct ordering,
// which is why the evolution layer (evolve.ts) exists.

import { config, N_PARAMS } from '../config';
import type { Figure } from '../core/figure';

export interface AdamState {
  m: Float64Array; // first moment
  v: Float64Array; // second moment
  t: number; // step count (for bias correction)
}

export function initAdam(n: number = N_PARAMS): AdamState {
  return { m: new Float64Array(n), v: new Float64Array(n), t: 0 };
}

/**
 * One Adam ascent step. Returns a fresh figure; mutates `state` in place. `grad` is ∇S.
 */
export function adamStep(
  figure: Figure,
  grad: Float64Array,
  state: AdamState,
  hp = config.adam,
): Figure {
  state.t += 1;
  const { lr, beta1, beta2, eps } = hp;
  const bc1 = 1 - Math.pow(beta1, state.t);
  const bc2 = 1 - Math.pow(beta2, state.t);
  const out = new Float64Array(figure.length);
  for (let i = 0; i < figure.length; i++) {
    const g = grad[i]!;
    state.m[i] = beta1 * state.m[i]! + (1 - beta1) * g;
    state.v[i] = beta2 * state.v[i]! + (1 - beta2) * g * g;
    const mhat = state.m[i]! / bc1;
    const vhat = state.v[i]! / bc2;
    out[i] = figure[i]! + (lr * mhat) / (Math.sqrt(vhat) + eps); // + = ASCENT
  }
  return out;
}
