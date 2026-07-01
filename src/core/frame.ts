// src/core/frame.ts
//
// The two anchors (CONCEPT.md §3). The origin is the entire scale-type story:
//   • Page — supplies a DIRECTION, no origin. Projections along it are INTERVAL (no true zero).
//   • PositedFrame — supplies ORIGIN + DIRECTION. Distances from the origin are RATIO; bearings CYCLIC.
//
// A frame's parameters may be fixed or optimized. In v1 they are FIXED (see config.frame), and the
// frame direction is chosen ∥ the page so that run/rise/tilt coincide across anchors.

import { config } from '../config';

export interface Page {
  /** Direction (not necessarily unit; readings normalize). No origin. */
  readonly direction: readonly [number, number];
}

export interface PositedFrame {
  readonly origin: readonly [number, number];
  readonly direction: readonly [number, number];
}

export function pageFromConfig(cfg = config): Page {
  return { direction: cfg.pageDirection };
}

export function frameFromConfig(cfg = config): PositedFrame {
  return { origin: cfg.frame.origin, direction: cfg.frame.direction };
}

// ── small geometry helpers on plain [x,y] pairs ──

export function unit(v: readonly [number, number]): [number, number] {
  const len = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / len, v[1] / len];
}

/** +90° rotation of a direction (the "across" axis for proj⊥). */
export function perp(u: readonly [number, number]): [number, number] {
  return [-u[1], u[0]];
}
