// src/core/measurements/readings.ts
//
// The four readings (proj∥, proj⊥, magnitude, angle) as pure vector ops, for both the plain-number
// and the differentiable (Value) paths. The whole 2×4×4 grid falls out of ONE code path:
//   • the only difference between page and frame is whether the origin O is subtracted (page has none);
//   • the only difference between point and displacement is whether v = (P − O) or v = d = end − start.
// A page-anchored point is read at its absolute position (interval); a difference (displacement, or a
// point measured from a frame origin) has a true zero (ratio); a bearing is cyclic.

import { Value, val, add, sub, mul, div, atan2, sqrt } from '../autograd/engine';
import { config } from '../../config';
import type { Figure } from '../figure';
import { segBase, SEG } from '../figure';
import type { PositedFrame } from '../frame';
import { unit } from '../frame';
import type { Anchor, Part, Reading } from './types';

// ── plain-number path ──────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

/** The vector actually measured for line i, given anchor + part. */
export function partVector(f: Figure, i: number, anchor: Anchor, part: Part, frame: PositedFrame): Vec2 {
  const b = segBase(i);
  const sx = f[b + SEG.SX]!;
  const sy = f[b + SEG.SY]!;
  const ex = f[b + SEG.EX]!;
  const ey = f[b + SEG.EY]!;
  if (part === 'displacement') return { x: ex - sx, y: ey - sy };
  let px: number;
  let py: number;
  if (part === 'start') {
    px = sx;
    py = sy;
  } else if (part === 'end') {
    px = ex;
    py = ey;
  } else {
    px = (sx + ex) / 2;
    py = (sy + ey) / 2;
  }
  if (anchor === 'frame') {
    px -= frame.origin[0];
    py -= frame.origin[1];
  }
  return { x: px, y: py };
}

/** Apply a reading to the part-vector, given a (normalized) anchor direction. */
export function readScalar(v: Vec2, reading: Reading, dir: readonly [number, number]): number {
  const [u0, u1] = dir;
  const projPar = v.x * u0 + v.y * u1;
  if (reading === 'projPar') return projPar;
  const projPerp = v.x * -u1 + v.y * u0; // dot with perp(u) = (-u1, u0)
  if (reading === 'projPerp') return projPerp;
  // magnitude floored by eps.length: sqrt(x²+y²+ε) — never exactly 0, so the ratio rung's log stays
  // finite for a collapsed segment (no NaN poisoning the whole gradient). ε tiny ⇒ negligible.
  if (reading === 'magnitude') return Math.sqrt(v.x * v.x + v.y * v.y + config.eps.length);
  return Math.atan2(projPerp, projPar); // bearing relative to the anchor direction
}

// ── differentiable (Value) path ─────────────────────────────────────────────────

export interface Vec2V {
  x: Value;
  y: Value;
}

export function partVectorV(
  leaves: Value[],
  i: number,
  anchor: Anchor,
  part: Part,
  frame: PositedFrame,
): Vec2V {
  const b = segBase(i);
  const sx = leaves[b + SEG.SX]!;
  const sy = leaves[b + SEG.SY]!;
  const ex = leaves[b + SEG.EX]!;
  const ey = leaves[b + SEG.EY]!;
  if (part === 'displacement') return { x: sub(ex, sx), y: sub(ey, sy) };
  let px: Value;
  let py: Value;
  if (part === 'start') {
    px = sx;
    py = sy;
  } else if (part === 'end') {
    px = ex;
    py = ey;
  } else {
    px = div(add(sx, ex), val(2));
    py = div(add(sy, ey), val(2));
  }
  if (anchor === 'frame') {
    px = sub(px, val(frame.origin[0]));
    py = sub(py, val(frame.origin[1]));
  }
  return { x: px, y: py };
}

export function readScalarV(v: Vec2V, reading: Reading, dir: readonly [number, number]): Value {
  const [u0, u1] = dir;
  const projPar = add(mul(v.x, val(u0)), mul(v.y, val(u1)));
  if (reading === 'projPar') return projPar;
  const projPerp = add(mul(v.x, val(-u1)), mul(v.y, val(u0)));
  if (reading === 'projPerp') return projPerp;
  // magnitude = sqrt(x²+y²+ε.length): the ε floor removes the zero-length singularity, so plain sqrt
  // is safe here (its derivative 1/(2√·) can never hit √0). Matches the plain path exactly.
  if (reading === 'magnitude') {
    const sq = add(add(mul(v.x, v.x), mul(v.y, v.y)), val(config.eps.length));
    return sqrt(sq);
  }
  return atan2(projPerp, projPar);
}

/** The normalized anchor direction for a measurement: page uses the page dir, frame the frame dir. */
export function anchorDir(
  anchor: Anchor,
  pageDirection: readonly [number, number],
  frameDirection: readonly [number, number],
): [number, number] {
  return unit(anchor === 'page' ? pageDirection : frameDirection);
}
