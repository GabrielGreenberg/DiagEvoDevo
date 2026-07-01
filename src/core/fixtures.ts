// src/core/fixtures.ts
//
// Hand-built fixtures. The golden bar chart is the reference optimum under FixedAssignment
// (sales → length, order → x-position): twelve vertical bars at increasing x, each of height
// k·value_i. It scores the maximum reward and is the anchor for the M4 golden-score invariants.

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
