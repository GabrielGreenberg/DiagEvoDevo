// src/core/penalties/spuriousness.ts
//
// Spuriousness / overencoding (CONCEPT.md §8): structure the figure asserts beyond the data — the
// canonical example is "equal spacing read as interval on ordinal labels." The order relation is
// ordinal (1 rung), so any INTERVAL structure its carrier exhibits (evenly-spaced x-positions) is
// surplus the data never granted. We measure it as F_int(orderCarrier, orderVector): high when the
// figure fabricates even spacing, low when it does not. Counterpart to the ladder (which rewards
// capture); kept on a separate book.
//
// Wired but zero-weighted in v1 (config.penalties.spuriousness = 0).

import type { Value } from '../autograd/engine';
import { val } from '../autograd/engine';
import { orderVector } from '../data';
import type { Figure } from '../figure';
import { getMeasurement } from '../measurements/registry';
import { fInt, fIntExact } from '../fidelity/ladder';
import type { Penalty, PenaltyContext } from './registry';

export const spuriousness: Penalty = {
  name: 'spuriousness',
  weight: (cfg) => cfg.penalties.spuriousness,
  value(leaves: Value[], ctx: PenaltyContext): Value {
    const orderId = ctx.map.get('order');
    if (orderId === undefined) return val(0);
    const carrier = getMeasurement(orderId).extractValue(leaves, ctx.frame, ctx.page);
    const ordVec = [...orderVector()].map((x) => val(x)); // constants
    return fInt(carrier, ordVec, ctx.cfg.eps.corrVar); // surplus interval structure on ordinal data
  },
  valueExact(figure: Figure, ctx: PenaltyContext): number {
    const orderId = ctx.map.get('order');
    if (orderId === undefined) return 0;
    const carrier = getMeasurement(orderId).extract(figure, ctx.frame, ctx.page);
    return fIntExact(carrier, orderVector());
  },
};
