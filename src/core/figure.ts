// src/core/figure.ts
//
// The figure (CONCEPT.md §2): twelve line segments. Each segment = start + end = 4 numbers, so the
// whole figure is a 48-dimensional parameter vector — the thing the optimizer moves.
//
// Canonical index layout (LOAD-BEARING, shared by measurements, gradient collection, and the
// optimizer): segment i occupies indices [4i, 4i+1, 4i+2, 4i+3] = [sx, sy, ex, ey]. A mismatch here
// silently transposes the gradient; the layout lives in exactly one place.

import { config, N_ITEMS, N_SEG_PARAMS, N_PARAMS } from '../config';
import { mulberry32, uniform } from './rng';

/** A figure is a flat Float64Array of length 48. */
export type Figure = Float64Array;

/** Offsets within one segment's 4-number block. */
export const SEG = { SX: 0, SY: 1, EX: 2, EY: 3 } as const;

export interface Pt {
  x: number;
  y: number;
}

/** Base index of segment i in the flat 48-vector. */
export function segBase(i: number): number {
  return i * N_SEG_PARAMS;
}

/**
 * Deterministic random figure from a seed: 48 endpoint coordinates uniform in the init box.
 * The figure seed is decorrelated from the (independent) data seed so that figure-seed N and
 * data-seed N do not share a random stream.
 */
export function seedToFigure(seed: number, cfg = config): Figure {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const f = new Float64Array(N_PARAMS);
  const { min, max } = cfg.figureInit;
  for (let i = 0; i < N_PARAMS; i++) f[i] = uniform(rng, min, max);
  return f;
}

export function cloneFigure(f: Figure): Figure {
  return new Float64Array(f);
}

// ── Accessors (plain-number path; the differentiable path builds Value leaves in measurements) ──

export function start(f: Figure, i: number): Pt {
  const b = segBase(i);
  return { x: f[b + SEG.SX]!, y: f[b + SEG.SY]! };
}

export function end(f: Figure, i: number): Pt {
  const b = segBase(i);
  return { x: f[b + SEG.EX]!, y: f[b + SEG.EY]! };
}

export function midpoint(f: Figure, i: number): Pt {
  const b = segBase(i);
  return { x: (f[b + SEG.SX]! + f[b + SEG.EX]!) / 2, y: (f[b + SEG.SY]! + f[b + SEG.EY]!) / 2 };
}

/** Displacement end − start (the segment as a self-anchored vector). */
export function displacement(f: Figure, i: number): Pt {
  const b = segBase(i);
  return { x: f[b + SEG.EX]! - f[b + SEG.SX]!, y: f[b + SEG.EY]! - f[b + SEG.SY]! };
}

/** Number of segments (12). */
export const N_SEGMENTS = N_ITEMS;
