// src/core/scale.ts
//
// Scale types and the "reads-down" partial order (CONCEPT.md §§3,5,7). Scale type is the payload:
// every measurement cell is stamped with the structure it can carry, read off its frame.
//
// The partial order (Stevens' admissible-transformation hierarchy):
//   ordinal ≤ interval ≤ ratio   — a total chain (ratio carries interval carries ordinal)
//   cyclic                       — ISOLATED: incomparable to all three (a wrap-around bearing has
//                                  no linear order; linear data can't be faithfully carried by it)
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
    [ScaleType.Cyclic]: false,
  },
  [ScaleType.Interval]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: true,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: false,
  },
  [ScaleType.Ratio]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: false,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: false,
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
