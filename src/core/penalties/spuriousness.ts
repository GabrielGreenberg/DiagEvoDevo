// src/core/penalties/spuriousness.ts
//
// DATA-INK penalty (CONCEPT.md §8, v2 semantics — repurposed from "overencoding" by the scoring-v2
// redesign): salient variation that carries NO data relation is fabricated structure the reader will
// try to decode. Per distinct carrier m:
//
//   ink_m = s_m · (1 − smoothmax_R q_m(R))          penalty = mean_m ink_m
//
// where s_m is the carrier's salience, q_m(R) its salience-gated cell for relation R, and smoothmax
// is the SAME mean-LSE used to aggregate relations (β = config.aggregation.beta; mean-form keeps
// smoothmax ≤ max ≤ 1, so every ink term is ≥ 0). A carrier that is quiet (s≈0) or that carries some
// relation well (max q ≈ 1) costs nothing; loud-but-meaningless variation is charged. This supplies
// the grounding / parallelism / quiet-unassigned-DOF pressure the audit found missing, without
// hard-coding any chart form.
//
// The per-carrier q values are COMPUTED IN score.ts and passed via PenaltyContext.cells /
// .cellsExact — the deepest correct layer: the penalty must see exactly the cells the reward saw,
// and must never recompute them. Standalone contexts without cells score 0.

import type { Value } from '../autograd/engine';
import { val, sub, mul } from '../autograd/engine';
import { mean } from '../autograd/ops';
import { lseMean, lseMeanN } from '../fidelity/ladder';
import type { Figure } from '../figure';
import type { Penalty, PenaltyContext } from './registry';

export const spuriousness: Penalty = {
  name: 'spuriousness',
  weight: (cfg) => cfg.penalties.spuriousness,
  value(_leaves: Value[], ctx: PenaltyContext): Value {
    const cells = ctx.cells;
    if (!cells || cells.length === 0) return val(0);
    const beta = ctx.cfg.aggregation.beta;
    const terms = cells.map((cell) =>
      mul(cell.salience, sub(val(1), lseMean([...cell.q.values()], beta))),
    );
    return mean(terms);
  },
  valueExact(_figure: Figure, ctx: PenaltyContext): number {
    const cells = ctx.cellsExact;
    if (!cells || cells.length === 0) return 0;
    const beta = ctx.cfg.aggregation.beta;
    let s = 0;
    for (const cell of cells) s += cell.salience * (1 - lseMeanN([...cell.q.values()], beta));
    return s / cells.length;
  },
};
