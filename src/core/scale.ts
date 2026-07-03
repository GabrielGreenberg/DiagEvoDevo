// src/core/scale.ts
//
// Scale types and the "reads-down" partial order (CONCEPT.md §§3,5,7). Scale type is the payload:
// every measurement cell is stamped with the structure it can carry, read off its frame.
//
// The reads-down order (Stevens' hierarchy; v2.2 — the circular edges RESTORED with sound forms):
//   ordinal ≤ interval ≤ ratio ≤ cyclic     (the full chain)
// Dials and gauges are legitimate encodings: an angle CAN carry ratio (bearing ∝ value from a
// reference) and interval (bearing affine in value — a dial with an arbitrary zero). The v2
// demotion of cyclic (ordinal-only) was a response to REAL defects — raw atan2 bearings fed into
// LINEAR statistics hit a catastrophic ±π branch-cut cliff (0.002 rad rotation collapsed a reward
// 5.56 → 0.84) and scored mirrored dials ≈ 0 — but the defect was in the RUNG FORMS, not in the
// lattice. v2.2 fixes it at the correct layer: rung forms route by the carrier's unit class
// (fidelity/rungs.ts) — angle carriers score interval via the wrap-invariant circular–linear
// correlation (ladder.fIntCirc) and ratio via the wrap-continuous magnitude form (ladder.fRatio,
// circular-appropriate as-is; see rungs.ts). NO reading is structurally blocked from any relation
// any more (user directive 2026-07-03); the only exclusions are the manual Readings toggles
// (config.carriers.disabled). The ordinal rung on raw bearings keeps its documented localized
// branch-cut limitation.
//
// Assignment legality (CONCEPT §7): a measurement with `stamp` can carry `dataType` iff
// dataType ≤ stamp ("read a stamp down, never up").

export enum ScaleType {
  Ordinal = 'ordinal',
  Interval = 'interval',
  Ratio = 'ratio',
  Cyclic = 'cyclic',
}

export const ALL_SCALE_TYPES: readonly ScaleType[] = [
  ScaleType.Ordinal,
  ScaleType.Interval,
  ScaleType.Ratio,
  ScaleType.Cyclic,
];

// Explicit 4×4 reachability table (a ≤ b?). Self-documenting; matches the Hasse diagram exactly.
const LEQ: Record<ScaleType, Record<ScaleType, boolean>> = {
  [ScaleType.Ordinal]: {
    [ScaleType.Ordinal]: true,
    [ScaleType.Interval]: true,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: true, // order can be read from an angle's rank
  },
  [ScaleType.Interval]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: true,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: true, // v2.2: a dial with an arbitrary zero — read via fIntCirc (wrap-safe)
  },
  [ScaleType.Ratio]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: false,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: true, // v2.2: a gauge — bearing ∝ value; read via the wrap-continuous fRatio
  },
  [ScaleType.Cyclic]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: false,
    [ScaleType.Ratio]: false,
    [ScaleType.Cyclic]: true,
  },
};

/** a ≤ b in the reads-down lattice. */
export function scaleLeq(a: ScaleType, b: ScaleType): boolean {
  return LEQ[a][b];
}

/**
 * Assignment legality: a measurement stamped `stamp` can carry a data relation of type `dataType`
 * iff dataType ≤ stamp. This is the SAME commensurability principle applied at the figure–data
 * boundary as like-with-like is applied within the figure (CONCEPT §5).
 */
export function commensurability(dataType: ScaleType, stamp: ScaleType): boolean {
  return scaleLeq(dataType, stamp);
}
