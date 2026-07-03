// src/core/fixtures.ts
//
// Hand-built fixtures. The golden bar chart is the reference optimum under FixedAssignment
// (sales → length, order → x-position): twelve vertical bars at increasing x, each of height
// k·value_i. It scores the maximum reward and is the anchor for the M4 golden-score invariants.
//
// v2 adds the AUDIT'S WINNING DEGENERATES as permanent regression fixtures (ported from
// scratch/audit_compare.ts): under the v1 comprehensive objective each of these BEAT the golden
// bar chart — the confirmed illegible-optimum defect. The v2 score must rank the golden bars
// above every one of them, forever (score.test.ts + scripts/accept.ts).

import { N_ITEMS } from '../config';
import type { DataSet } from './data';
import { labelFor } from './data';
import type { Figure } from './figure';
import { segBase } from './figure';

export interface GoldenOptions {
  k?: number; // height scale: bar height = k·value
  baseline?: number; // common baseline y (start y of every bar)
  spacing?: number; // x spacing between adjacent bars
  x0?: number; // x of the first bar
}

/**
 * A perfect bar chart for `data`: bar i is the vertical segment
 *   start = (x0 + i·spacing, baseline),  end = (x0 + i·spacing, baseline + k·value_i).
 * Length = k·value_i (∝ sales ⇒ ratio rung maxed); start x = x0 + i·spacing (monotone ⇒ order rung maxed).
 */
export function goldenBarChart(data: DataSet, opts: GoldenOptions = {}): Figure {
  const { k = 1, baseline = 0, spacing = 10, x0 = 5 } = opts;
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const x = x0 + i * spacing;
    f[b + 0] = x; // start.x
    f[b + 1] = baseline; // start.y
    f[b + 2] = x; // end.x
    f[b + 3] = baseline + k * data.values[i]!; // end.y (bar height)
  }
  return f;
}

/** A canonical dataset with well-separated, distinct, UNSORTED values (surrogate margins stay large). */
export function wellSeparatedData(): DataSet {
  const values = Float64Array.from([300, 50, 900, 140, 600, 25, 1000, 200, 450, 90, 780, 10]);
  const labels = Array.from({ length: N_ITEMS }, (_, i) => labelFor(i));
  return { labels, values, seed: -1 };
}

// ── audit regression figures (each one beat the golden bars under the v1 objective) ──

/** Build a figure from a per-segment [sx, sy, ex, ey] rule. */
function buildFigure(fill: (i: number) => [number, number, number, number]): Figure {
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const [sx, sy, ex, ey] = fill(i);
    f[b] = sx;
    f[b + 1] = sy;
    f[b + 2] = ex;
    f[b + 3] = ey;
  }
  return f;
}

/** A value scale that puts the largest bar/ray at ~`span` page units. */
export function valueScale(data: DataSet, span = 100): number {
  let vmax = 0;
  for (let i = 0; i < N_ITEMS; i++) vmax = Math.max(vmax, data.values[i]!);
  return vmax > 0 ? span / vmax : 1;
}

/** The LOUD golden layout (2026-07-02 acceptance finding): spacing 100 puts the x-position ORDER
 *  carriers far above the reader-resolution θ_len (salience ≈ 1.0, like session endpoints), unlike
 *  the 0.92-salient spacing-10 default — comparisons against evolved figures are like-for-like.
 *  Used by scripts/accept.ts (gate fixtures) and the GUI's reference cell (src/ui/reference.ts). */
export function loudGoldenBarChart(data: DataSet): Figure {
  return goldenBarChart(data, { k: valueScale(data), spacing: 100, x0: 5 });
}

/** Bars sorted by VALUE, not label: sales gains x as a carrier, the order axis is destroyed. */
export function valueSortedBars(data: DataSet, k = valueScale(data)): Figure {
  const idx = Array.from({ length: N_ITEMS }, (_, i) => i).sort(
    (a, b) => data.values[a]! - data.values[b]!,
  );
  const rankOf = new Array<number>(N_ITEMS);
  idx.forEach((item, rank) => (rankOf[item] = rank));
  return buildFigure((i) => {
    const x = 5 + rankOf[i]! * 10;
    return [x, 0, x, k * data.values[i]!];
  });
}

/** "Everything ∝ value": both endpoints of every segment are v_i·const — overlapping nested rays. */
export function nestedRay(data: DataSet, k = valueScale(data)): Figure {
  return buildFigure((i) => {
    const t = k * data.values[i]!;
    return [0.3 * t, 0.1 * t, 1.0 * t, 0.8 * t];
  });
}

/** All segments from the origin along ONE direction, length ∝ value: a collinear pile-up. */
export function collinearPileup(data: DataSet, k = valueScale(data)): Figure {
  return buildFigure((i) => {
    const t = k * data.values[i]!;
    return [0, 0, 0.8 * t, 0.6 * t];
  });
}

/** Nested ray with a TINY monotone rotation per item: angle whispers order, points still ∝ value. */
export function valueSpiral(data: DataSet, k = valueScale(data)): Figure {
  return buildFigure((i) => {
    const th = 0.6 + 0.02 * i;
    const t = k * data.values[i]!;
    const c = Math.cos(th);
    const s = Math.sin(th);
    return [0.3 * t * c - 0.1 * t * s, 0.3 * t * s + 0.1 * t * c, t * c, t * s];
  });
}

// ── dial fixture (v2.2 ratio≤cyclic restore: a gauge is a legitimate encoding) ──

export interface DialOptions {
  /** Radians per data unit: bearing_i = k·value_i + phase. Default spans `span` at the data max. */
  k?: number;
  /** Total bearing span (radians) at the dataset's max value, used only when k is not given. */
  span?: number;
  /** Common rotation added to every bearing — a gauge's zero offset (0 = reference-aligned). */
  phase?: number;
  /** Common needle origin (page units). Put it at the frame origin to make the point-angle
   *  carriers coincide with the tilt — an ACHIEVED identity, good for coincidence tests. */
  center?: [number, number];
  /** Common needle length (equal on purpose: length must carry nothing on a pure dial). */
  radius?: number;
}

/**
 * A perfect dial/gauge for `data`: twelve equal-length needles from a common center, needle i at
 * bearing k·value_i + phase from the page reference direction. The tilt carrier reads EXACTLY
 * k·v + phase (mod 2π): at phase 0 the ratio rung is maxed (|θ| ∝ v, coherent side) and fIntCirc
 * ≈ 1; any phase keeps fIntCirc unchanged (rotation invariance) while the ratio rung honestly
 * degrades (a gauge's zero matters for RATIO). Mirrored dial = negative k.
 */
export function dialChart(data: DataSet, opts: DialOptions = {}): Figure {
  let vmax = 0;
  for (let i = 0; i < N_ITEMS; i++) vmax = Math.max(vmax, data.values[i]!);
  const { span = 2.5, phase = 0, center = [50, 50], radius = 40 } = opts;
  const k = opts.k ?? (vmax > 0 ? span / vmax : 1);
  return buildFigure((i) => {
    const th = k * data.values[i]! + phase;
    return [center[0], center[1], center[0] + radius * Math.cos(th), center[1] + radius * Math.sin(th)];
  });
}

/** The named degenerate line-up for ranking gates (golden must beat every one of them). */
export function auditDegenerates(data: DataSet): { name: string; figure: Figure }[] {
  return [
    { name: 'value-sorted bars', figure: valueSortedBars(data) },
    { name: 'nested ray', figure: nestedRay(data) },
    { name: 'collinear pileup', figure: collinearPileup(data) },
    { name: 'value spiral', figure: valueSpiral(data) },
  ];
}
