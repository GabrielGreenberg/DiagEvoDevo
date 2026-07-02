// src/core/scale.ts
//
// Scale types and the "reads-down" partial order (CONCEPT.md §§3,5,7). Scale type is the payload:
// every measurement cell is stamped with the structure it can carry, read off its frame.
//
// The reads-down order (Stevens' hierarchy; v2 after the scoring-v2 redesign):
//   ordinal ≤ interval ≤ ratio      (the linear chain)
//   ordinal ≤ cyclic                (and NOTHING else is ≤ cyclic)
// A bearing's rank can carry ORDER (a dial's needle positions are readable as a sequence), but the
// v1 idea that raw atan2 bearings carry interval/ratio was CONFIRMED unsound by the audit: linear
// stats on raw bearings hit branch-cut cliffs and score mirrored dials ~0. Interval/ratio-from-
// bearings stays OFF until genuine circular rung forms exist (registered open question). The
// branch-cut on ordinal-from-bearings remains a documented known limitation.
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
    [ScaleType.Cyclic]: false, // v2: no linear-metric structure read from raw bearings (branch cuts)
  },
  [ScaleType.Ratio]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: false,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: false, // v2: ratio-from-bearing removed until circular rung forms exist
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
