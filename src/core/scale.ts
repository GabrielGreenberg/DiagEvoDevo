// src/core/scale.ts
//
// Scale types and the "reads-down" partial order (CONCEPT.md §§3,5,7). Scale type is the payload:
// every measurement cell is stamped with the structure it can carry, read off its frame.
//
// The reads-down order (Stevens' hierarchy, with this project's frame-relative reading of angles):
//   ordinal ≤ interval ≤ ratio ≤ cyclic   — a total chain, CYCLIC ON TOP.
// A bearing measured from the frame/page direction has a true zero (the reference direction) and its
// angle-magnitude carries proportion, so an angle can carry RATIO data (a dial/radial encoding of value);
// its rank carries ORDER; hence a cyclic measurement is the RICHEST carrier — it can carry ordinal,
// interval, and ratio data (plus its own wrap). Linear data types can't be read AS cyclic, so nothing is
// ≤ ordinal below and only cyclic ≤ cyclic at the top.
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
    [ScaleType.Cyclic]: true, // interval structure fits inside an angle from the reference
  },
  [ScaleType.Ratio]: {
    [ScaleType.Ordinal]: false,
    [ScaleType.Interval]: false,
    [ScaleType.Ratio]: true,
    [ScaleType.Cyclic]: true, // a bearing from the origin direction carries ratio (angle-magnitude)
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
