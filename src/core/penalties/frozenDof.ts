// src/core/penalties/frozenDof.ts
//
// Frozen degrees of freedom (CONCEPT.md §8): measurements assigned no datum (baseline height, tilt)
// should carry no across-line variance. Penalize Var(baseline) + circularVar(tilt). Driving these to
// zero installs the shared baseline / common orientation WITHOUT hard-coding "bar chart", and
// upgrades length-comparison into position-on-a-common-scale.
//
// Wired but zero-weighted in v1 (config.penalties.frozenDof = 0). Computes a sane value regardless,
// so enabling the weight (M8) has the intended effect with no code change.

import type { Value } from '../autograd/engine';
import { add } from '../autograd/engine';
import { variance, circularVar } from '../autograd/ops';
import type { Figure } from '../figure';
import { getMeasurement } from '../measurements/registry';
import { varianceN, circularVarN } from '../statsN';
import type { Penalty, PenaltyContext } from './registry';

const BASELINE = 'page.start.projPerp'; // start y-position = baseline height (a frozen DOF)
const TILT = 'page.displacement.angle'; // segment tilt = orientation (a frozen DOF)

export const frozenDof: Penalty = {
  name: 'frozenDof',
  weight: (cfg) => cfg.penalties.frozenDof,
  value(leaves: Value[], ctx: PenaltyContext): Value {
    const baseline = getMeasurement(BASELINE).extractValue(leaves, ctx.frame, ctx.page);
    const tilt = getMeasurement(TILT).extractValue(leaves, ctx.frame, ctx.page);
    return add(variance(baseline), circularVar(tilt, ctx.cfg.eps.circular));
  },
  valueExact(figure: Figure, ctx: PenaltyContext): number {
    const baseline = getMeasurement(BASELINE).extract(figure, ctx.frame, ctx.page);
    const tilt = getMeasurement(TILT).extract(figure, ctx.frame, ctx.page);
    return varianceN(baseline) + circularVarN(tilt, ctx.cfg.eps.circular);
  },
};
