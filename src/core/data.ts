// src/core/data.ts
//
// The dataset (CONCEPT.md §2): twelve items labelled A..L, a product structure ⟨labels,<⟩ × ⟨values,ratio⟩.
//   • Order on the labels A<B<…<L — scale type ORDINAL. Fixed; not seeded.
//   • Value per item — a positive real (dollar amount), scale type RATIO (true zero). Seeded.
// The two families do not interact structurally even though values may covary with order.

import { config, N_ITEMS } from '../config';
import { mulberry32, uniform } from './rng';

export interface DataSet {
  /** ['A','B',…,'L'] — the ordinal axis, fixed. */
  readonly labels: readonly string[];
  /** Length-12 strictly-positive ratio values (dollar amounts). Index i pairs with labels[i]. */
  readonly values: Float64Array;
  /** The data seed that generated `values`. */
  readonly seed: number;
}

/** The canonical A..L labels (index 0 → 'A'). */
export function labelFor(i: number): string {
  return String.fromCharCode(65 + i);
}

/**
 * Deterministic dataset from a seed: twelve positive ratio values. The label ORDER is fixed
 * (A<…<L); values are independent of it (item A may exceed item B). Values are drawn logUniform
 * by default so ratios span a healthy range (good for the ratio rung).
 */
export function seedToDataSet(seed: number, cfg = config): DataSet {
  const rng = mulberry32(seed);
  const { min, max, distribution } = cfg.dataInit;
  const values = new Float64Array(N_ITEMS);
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  for (let i = 0; i < N_ITEMS; i++) {
    values[i] =
      distribution === 'logUniform'
        ? Math.exp(uniform(rng, logMin, logMax))
        : uniform(rng, min, max);
  }
  const labels = Array.from({ length: N_ITEMS }, (_, i) => labelFor(i));
  return { labels, values, seed };
}

/**
 * The order relation's data vector: the label positions 0..11 (a monotone stand-in for A<…<L).
 * Only its ORDER carries meaning (the relation is ordinal); spacing is not asserted.
 */
export function orderVector(): Float64Array {
  const v = new Float64Array(N_ITEMS);
  for (let i = 0; i < N_ITEMS; i++) v[i] = i;
  return v;
}
