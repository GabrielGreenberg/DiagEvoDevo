// src/core/penalties/economy.ts
//
// Economy / Occam pressure (CONCEPT.md §8): penalize the count of posited frames and active
// measurements. A structural cost of the assignment (independent of the figure coordinates), so its
// gradient is zero — it shifts the score offset, it does not pull the segments.
//
// Wired but zero-weighted in v1 (config.penalties.economy = 0).

import type { Value } from '../autograd/engine';
import { val } from '../autograd/engine';
import type { Figure } from '../figure';
import type { Penalty, PenaltyContext } from './registry';

function countEconomy(ctx: PenaltyContext): number {
  const ids = new Set(ctx.map.values());
  let framesUsed = 0;
  for (const id of ids) {
    const m = ctx.registry.get(id);
    if (m && m.anchor === 'frame') framesUsed = 1; // one shared posited frame in v1
  }
  return ids.size + framesUsed; // active measurements + posited frames
}

export const economy: Penalty = {
  name: 'economy',
  weight: (cfg) => cfg.penalties.economy,
  value(_leaves: Value[], ctx: PenaltyContext): Value {
    return val(countEconomy(ctx)); // constant ⇒ zero gradient
  },
  valueExact(_figure: Figure, ctx: PenaltyContext): number {
    return countEconomy(ctx);
  },
};
