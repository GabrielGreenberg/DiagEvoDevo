// src/core/measurements/paths.ts
//
// MEASUREMENT PATHS (CONCEPT §7, strong coincidence): the piece of page INK a reading procedure
// traces when a reader actually performs it. The weak coincidence bonus compares two readings'
// NUMBERS; the strong version additionally requires their measurement paths to coincide as ink —
// that is what distinguishes an AXIS (identity by construction: two rulers arranged to lie on the
// same ink) from a COLLAPSE (identity by degeneration: a segment shrunk until its readings agree
// about nothing visible).
//
// Per item i, each length-class reading's path is a page segment [A, B], derived STRUCTURALLY from
// the reading's (anchor, part, reading) against the configured geometry (cfg.frame / cfg.page —
// nothing is hard-coded to the v1 axes, so the map survives the movable frame, M8). With O the
// frame origin, u the unit frame direction, w = perp(u), and P the item's start/mid/end point
// (v1 geometry in parentheses: O = (0,0), u = x̂, w = ŷ):
//   • point projPar  ("x" of P):  A = O + ((P−O)·w)·w,  B = P   (the horizontal ruler at the
//     point's height, out from the perp axis: A = (0, P_y), B = (P_x, P_y))
//   • point projPerp ("y" of P):  A = O + ((P−O)·u)·u,  B = P   (the vertical plumb at the
//     point's x, up from the frame axis: A = (P_x, 0), B = (P_x, P_y))
//   • point magnitude (fr·dist):  A = O,                B = P   (the radial ruler)
//   • disp magnitude (length):    A = start,            B = end (the segment's own ink)
//   • disp projPar   (run):       A = start,            B = C   (the parallel leg of the dogleg)
//   • disp projPerp  (rise):      A = C,                B = end (the perpendicular leg)
//     with the dogleg CORNER C = start + ((end−start)·d)·d for the reading's anchor direction d —
//     the CONVENTION: the parallel leg is walked FIRST, so C = (end_x, start_y) in v1, and a
//     vertical bar's rise leg IS its ink (legitimately coincident with length, grounded or not).
// Readings with NO determinate linear ink-path return null and the strong pair falls back to the
// weak formula (documented in config.bonuses.coincidence.mode):
//   • angle readings — a bearing's ink is an ARC; its strong theory awaits arcs;
//   • page-anchored point projections — an origin-free interval position has no ruler zero to
//     start the ink from (they only exist as distinct carriers when the frame leaves the page
//     origin; under the v1 geometry every point projection is frame-merged and HAS a path).
// A merged carrier's path uses its CANONICAL member's geometry (registry dedup guarantees every
// member reads the same vector, and the canonical member is the max-stamp/origin-bearing one).
//
// The OVERLAP KERNEL (smooth, orientation-symmetric — a path traced backwards is the same ink):
//   ov_i = exp( −min(‖A₁−A₂‖²+‖B₁−B₂‖², ‖A₁−B₂‖²+‖B₁−A₂‖²) / (2σ_path²) ),  smooth min (ladder).
// The INK GATE (the collapse killer): g_i = ‖disp_i‖² / (‖disp_i‖² + θ_ink²) — a pair's overlap on
// item i counts only in proportion to that segment's visible extent (a point's paths coincide for
// free and prove nothing). strongOverlap(m₁,m₂) = mean_i( ov_i · g_i ) ∈ [0, 1] (up to the
// smoothAbs ε-rounding of the min, ≤ e^(√ε/4σ²) − 1 ≈ 1e-8 above 1 on exactly-degenerate paths).
//
// TAPE HYGIENE: builders cache every shared subexpression once per eval — the per-item start/mid/
// end points, the (P−O) components, the plumb feet's projections, the dogleg corners, the ink
// displacements (d², shared with the gate), and each carrier's full 12-path array. Score-side, the
// per-PAIR overlap is cached across relations (like eq). None of this is built in weak mode.

import { Value, val, add, sub, mul, div, exp, neg } from '../autograd/engine';
import { mean } from '../autograd/ops';
import { smoothMin, smoothMinN } from '../fidelity/ladder';
import { N_ITEMS } from '../../config';
import type { Figure } from '../figure';
import { segBase, SEG } from '../figure';
import type { Page, PositedFrame } from '../frame';
import { unit, perp } from '../frame';
import type { Measurement, Part } from './types';
import { anchorDir } from './readings';

// ── path types (page coordinates) ────────────────────────────────────────────────

export type Pt2V = readonly [Value, Value];
export interface PathV {
  readonly A: Pt2V;
  readonly B: Pt2V;
}

export type Pt2N = readonly [number, number];
export interface PathN {
  readonly A: Pt2N;
  readonly B: Pt2N;
}

// ── overlap kernel + ink gate (Value and exact twins, same formula) ──────────────

function dist2(p: Pt2V, q: Pt2V): Value {
  const dx = sub(p[0], q[0]);
  const dy = sub(p[1], q[1]);
  return add(mul(dx, dx), mul(dy, dy));
}

/** ov = exp(−smoothmin(same-way, crossed)/(2σ_path²)): 1 when the two paths lie on the same ink
 *  (either orientation), decaying at the σ_path page-unit scale. absEps = config.eps.absSmooth. */
export function pathOverlap(p1: PathV, p2: PathV, sigmaPath: number, absEps: number): Value {
  const dpp = add(dist2(p1.A, p2.A), dist2(p1.B, p2.B));
  const dx = add(dist2(p1.A, p2.B), dist2(p1.B, p2.A));
  return exp(neg(div(smoothMin(dpp, dx, absEps), val(2 * sigmaPath * sigmaPath))));
}

/** Exact twin of pathOverlap (same smooth-min formula — lockstep by design). */
export function pathOverlapN(p1: PathN, p2: PathN, sigmaPath: number, absEps: number): number {
  const d2 = (p: Pt2N, q: Pt2N): number => {
    const dx = p[0] - q[0];
    const dy = p[1] - q[1];
    return dx * dx + dy * dy;
  };
  const dpp = d2(p1.A, p2.A) + d2(p1.B, p2.B);
  const dx = d2(p1.A, p2.B) + d2(p1.B, p2.A);
  return Math.exp(-smoothMinN(dpp, dx, absEps) / (2 * sigmaPath * sigmaPath));
}

/** strongOverlap(m₁,m₂) = mean_i( ov_i · g_i ): per-item ink alignment, gated per item by the
 *  segment's visible extent. `gate` is the shared inkGate vector (one per eval, all pairs). */
export function strongOverlap(
  a: readonly PathV[],
  b: readonly PathV[],
  gate: readonly Value[],
  sigmaPath: number,
  absEps: number,
): Value {
  const terms = a.map((pa, i) => mul(pathOverlap(pa, b[i]!, sigmaPath, absEps), gate[i]!));
  return mean(terms);
}

/** Exact twin of strongOverlap. */
export function strongOverlapN(
  a: readonly PathN[],
  b: readonly PathN[],
  gate: ArrayLike<number>,
  sigmaPath: number,
  absEps: number,
): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += pathOverlapN(a[i]!, b[i]!, sigmaPath, absEps) * gate[i]!;
  return a.length > 0 ? s / a.length : 0;
}

// ── constant-folding helpers (keep the strong tape lean under axis-aligned geometry) ──

/** p + t·d with folding of d ∈ {0, ±1} components (v1 doglegs cost 1 node, not 6). */
function offsetPointV(p: Pt2V, t: Value, d: readonly [number, number]): Pt2V {
  const comp = (pc: Value, dc: number): Value =>
    dc === 0 ? pc : add(pc, dc === 1 ? t : mul(t, val(dc)));
  return [comp(p[0], d[0]), comp(p[1], d[1])];
}

/** o + t·d on a CONSTANT origin, folded: a v1 plumb foot is [leaf-projection, val(0)]. */
function axisPointV(o: readonly [number, number], t: Value, d: readonly [number, number]): Pt2V {
  const comp = (oc: number, dc: number): Value => {
    if (dc === 0) return val(oc);
    const td = dc === 1 ? t : mul(t, val(dc));
    return oc === 0 ? td : add(td, val(oc));
  };
  return [comp(o[0], d[0]), comp(o[1], d[1])];
}

/** (x, y)·d folded (v1: the projection onto x̂ IS the x node — zero new nodes). */
function dotV(x: Value, y: Value, d: readonly [number, number]): Value {
  const tx = d[0] === 0 ? null : d[0] === 1 ? x : mul(x, val(d[0]));
  const ty = d[1] === 0 ? null : d[1] === 1 ? y : mul(y, val(d[1]));
  if (tx !== null && ty !== null) return add(tx, ty);
  return tx ?? ty ?? val(0);
}

/** x − k folded (v1 origin components are 0: rel ≡ the point itself). */
function subConstV(x: Value, k: number): Value {
  return k === 0 ? x : sub(x, val(k));
}

// ── Value-path builder ───────────────────────────────────────────────────────────

export class MeasurementPathsValue {
  private readonly leaves: Value[];
  private readonly frame: PositedFrame;
  private readonly page: Page;
  private readonly u: readonly [number, number]; // unit frame direction
  private readonly w: readonly [number, number]; // perp(u)
  private points = new Map<Part, Pt2V[]>(); // per-item page coords of start/mid/end
  private rels = new Map<Part, Pt2V[]>(); // P − O components (frame point readings)
  private projs = new Map<string, Value[]>(); // `${part}|par` / `${part}|per` foot projections
  private corners = new Map<string, Pt2V[]>(); // dogleg corners per anchor direction
  private disps: Pt2V[] | null = null; // end − start components (shared with the ink gate)
  private dispSq: Value[] | null = null; // ‖disp‖² per item
  private gates = new Map<number, Value[]>(); // ink gate per θ_ink
  private byId = new Map<string, readonly PathV[] | null>(); // full per-carrier path arrays

  constructor(leaves: Value[], frame: PositedFrame, page: Page) {
    this.leaves = leaves;
    this.frame = frame;
    this.page = page;
    this.u = unit(frame.direction);
    this.w = perp(this.u);
  }

  private pointsOf(part: Part): Pt2V[] {
    let pts = this.points.get(part);
    if (pts === undefined) {
      pts = new Array<Pt2V>(N_ITEMS);
      for (let i = 0; i < N_ITEMS; i++) {
        const b = segBase(i);
        const sx = this.leaves[b + SEG.SX]!;
        const sy = this.leaves[b + SEG.SY]!;
        const ex = this.leaves[b + SEG.EX]!;
        const ey = this.leaves[b + SEG.EY]!;
        pts[i] =
          part === 'start'
            ? [sx, sy]
            : part === 'end'
              ? [ex, ey]
              : [div(add(sx, ex), val(2)), div(add(sy, ey), val(2))];
      }
      this.points.set(part, pts);
    }
    return pts;
  }

  private relsOf(part: Part): Pt2V[] {
    let r = this.rels.get(part);
    if (r === undefined) {
      const [ox, oy] = this.frame.origin;
      r = this.pointsOf(part).map((p): Pt2V => [subConstV(p[0], ox), subConstV(p[1], oy)]);
      this.rels.set(part, r);
    }
    return r;
  }

  /** (P−O)·u ('par') or (P−O)·w ('per') per item — a plumb foot's 1-D coordinate. */
  private projOf(part: Part, which: 'par' | 'per'): Value[] {
    const key = `${part}|${which}`;
    let t = this.projs.get(key);
    if (t === undefined) {
      const d = which === 'par' ? this.u : this.w;
      t = this.relsOf(part).map((rel) => dotV(rel[0], rel[1], d));
      this.projs.set(key, t);
    }
    return t;
  }

  private dispsOf(): Pt2V[] {
    if (this.disps === null) {
      this.disps = new Array<Pt2V>(N_ITEMS);
      for (let i = 0; i < N_ITEMS; i++) {
        const b = segBase(i);
        this.disps[i] = [
          sub(this.leaves[b + SEG.EX]!, this.leaves[b + SEG.SX]!),
          sub(this.leaves[b + SEG.EY]!, this.leaves[b + SEG.SY]!),
        ];
      }
    }
    return this.disps;
  }

  private dispSqOf(): Value[] {
    if (this.dispSq === null) {
      this.dispSq = this.dispsOf().map(([dx, dy]) => add(mul(dx, dx), mul(dy, dy)));
    }
    return this.dispSq;
  }

  private cornersOf(dir: readonly [number, number]): Pt2V[] {
    const key = `${dir[0]}|${dir[1]}`;
    let c = this.corners.get(key);
    if (c === undefined) {
      const starts = this.pointsOf('start');
      const disps = this.dispsOf();
      c = starts.map((s, i) => offsetPointV(s, dotV(disps[i]![0], disps[i]![1], dir), dir));
      this.corners.set(key, c);
    }
    return c;
  }

  /** The ink gate g_i = ‖disp_i‖²/(‖disp_i‖² + θ_ink²), shared across every pair of the eval. */
  inkGate(thetaInk: number): Value[] {
    let g = this.gates.get(thetaInk);
    if (g === undefined) {
      g = this.dispSqOf().map((d2) => div(d2, add(d2, val(thetaInk * thetaInk))));
      this.gates.set(thetaInk, g);
    }
    return g;
  }

  /** The 12 measurement paths of a reading, or null when it has no linear ink-path (header). */
  pathsFor(m: Measurement): readonly PathV[] | null {
    let paths = this.byId.get(m.id);
    if (paths === undefined) {
      paths = this.build(m);
      this.byId.set(m.id, paths);
    }
    return paths;
  }

  private build(m: Measurement): readonly PathV[] | null {
    if (m.reading === 'angle') return null; // an arc, not a segment — strong theory pending
    if (m.part === 'displacement') {
      const starts = this.pointsOf('start');
      const ends = this.pointsOf('end');
      if (m.reading === 'magnitude') {
        return starts.map((s, i): PathV => ({ A: s, B: ends[i]! }));
      }
      const dir = anchorDir(m.anchor, this.page.direction, this.frame.direction);
      const corners = this.cornersOf(dir);
      return m.reading === 'projPar'
        ? starts.map((s, i): PathV => ({ A: s, B: corners[i]! }))
        : corners.map((c, i): PathV => ({ A: c, B: ends[i]! }));
    }
    if (m.anchor === 'page') return null; // origin-free position: no ruler zero
    const pts = this.pointsOf(m.part);
    const O = this.frame.origin;
    if (m.reading === 'magnitude') {
      const origin: Pt2V = [val(O[0]), val(O[1])];
      return pts.map((p): PathV => ({ A: origin, B: p }));
    }
    // plumb feet: projPar starts on the PERP axis (A = O + per·w), projPerp on the PAR axis
    const which = m.reading === 'projPar' ? 'per' : 'par';
    const axis = m.reading === 'projPar' ? this.w : this.u;
    const t = this.projOf(m.part, which);
    return pts.map((p, i): PathV => ({ A: axisPointV(O, t[i]!, axis), B: p }));
  }
}

// ── exact twin (plain numbers, same geometry) ────────────────────────────────────

export class MeasurementPathsExact {
  private readonly figure: Figure;
  private readonly frame: PositedFrame;
  private readonly page: Page;
  private readonly u: readonly [number, number];
  private readonly w: readonly [number, number];
  private byId = new Map<string, readonly PathN[] | null>();
  private gates = new Map<number, Float64Array>();

  constructor(figure: Figure, frame: PositedFrame, page: Page) {
    this.figure = figure;
    this.frame = frame;
    this.page = page;
    this.u = unit(frame.direction);
    this.w = perp(this.u);
  }

  private point(i: number, part: Part): Pt2N {
    const b = segBase(i);
    const sx = this.figure[b + SEG.SX]!;
    const sy = this.figure[b + SEG.SY]!;
    const ex = this.figure[b + SEG.EX]!;
    const ey = this.figure[b + SEG.EY]!;
    if (part === 'start') return [sx, sy];
    if (part === 'end') return [ex, ey];
    return [(sx + ex) / 2, (sy + ey) / 2];
  }

  inkGate(thetaInk: number): Float64Array {
    let g = this.gates.get(thetaInk);
    if (g === undefined) {
      g = new Float64Array(N_ITEMS);
      for (let i = 0; i < N_ITEMS; i++) {
        const b = segBase(i);
        const dx = this.figure[b + SEG.EX]! - this.figure[b + SEG.SX]!;
        const dy = this.figure[b + SEG.EY]! - this.figure[b + SEG.SY]!;
        const d2 = dx * dx + dy * dy;
        g[i] = d2 / (d2 + thetaInk * thetaInk);
      }
      this.gates.set(thetaInk, g);
    }
    return g;
  }

  pathsFor(m: Measurement): readonly PathN[] | null {
    let paths = this.byId.get(m.id);
    if (paths === undefined) {
      paths = this.build(m);
      this.byId.set(m.id, paths);
    }
    return paths;
  }

  private build(m: Measurement): readonly PathN[] | null {
    if (m.reading === 'angle') return null;
    const out: PathN[] = new Array<PathN>(N_ITEMS);
    if (m.part === 'displacement') {
      const dir = anchorDir(m.anchor, this.page.direction, this.frame.direction);
      for (let i = 0; i < N_ITEMS; i++) {
        const s = this.point(i, 'start');
        const e = this.point(i, 'end');
        if (m.reading === 'magnitude') {
          out[i] = { A: s, B: e };
          continue;
        }
        const t = (e[0] - s[0]) * dir[0] + (e[1] - s[1]) * dir[1];
        const c: Pt2N = [s[0] + t * dir[0], s[1] + t * dir[1]];
        out[i] = m.reading === 'projPar' ? { A: s, B: c } : { A: c, B: e };
      }
      return out;
    }
    if (m.anchor === 'page') return null;
    const O = this.frame.origin;
    for (let i = 0; i < N_ITEMS; i++) {
      const p = this.point(i, m.part);
      if (m.reading === 'magnitude') {
        out[i] = { A: [O[0], O[1]], B: p };
        continue;
      }
      const rel: Pt2N = [p[0] - O[0], p[1] - O[1]];
      const axis = m.reading === 'projPar' ? this.w : this.u;
      const t = rel[0] * axis[0] + rel[1] * axis[1];
      out[i] = { A: [O[0] + t * axis[0], O[1] + t * axis[1]], B: p };
    }
    return out;
  }
}
