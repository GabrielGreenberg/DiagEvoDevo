// src/core/measurements/types.ts
//
// A Measurement is one cell of the stock (CONCEPT.md §3): a fixed (anchor, part, reading) choice
// with its scale-type stamp, plus the two extraction paths.
//
// The 12-vector is the atomic unit of comparison (CONCEPT §4): each measurement, applied across the
// twelve lines, yields one length-12 vector. A measurement fixes exactly ONE reading, so a
// cross-reading vector ("A's length vs B's angle") is unrepresentable through this API — that is
// commensurability §5 enforced structurally, not by a runtime check.

import type { Value } from '../autograd/engine';
import type { Figure } from '../figure';
import type { Page, PositedFrame } from '../frame';
import type { ScaleType } from '../scale';

export type Anchor = 'page' | 'frame';
export type Part = 'start' | 'end' | 'midpoint' | 'displacement';
export type Reading = 'projPar' | 'projPerp' | 'magnitude' | 'angle';

export const ANCHORS: readonly Anchor[] = ['page', 'frame'];
export const PARTS: readonly Part[] = ['start', 'end', 'midpoint', 'displacement'];
export const READINGS: readonly Reading[] = ['projPar', 'projPerp', 'magnitude', 'angle'];

export interface Measurement {
  /** e.g. 'frame.end.projPar'. */
  readonly id: string;
  readonly anchor: Anchor;
  readonly part: Part;
  readonly reading: Reading;
  readonly stamp: ScaleType;
  /** Plain-number path (display / exact metrics): the length-12 reading vector. */
  extract(figure: Figure, frame?: PositedFrame, page?: Page): Float64Array;
  /** Differentiable path: same formula over the 48 Value leaves → length-12 Value vector. */
  extractValue(leaves: Value[], frame?: PositedFrame, page?: Page): Value[];
}
