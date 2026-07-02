// src/ui/reference.ts
//
// The gallery's permanent REFERENCE cell: a hand-built golden bar chart of the SESSION's dataset,
// scored under the SESSION's snapshotted config (so carrier toggles, knobs, and the data seed all
// apply). It is a UI-LAYER BENCHMARK, not an optimizer object: it never steps, is not eligible for
// the ★ best marker, cannot be Saved, and does not touch src/optim — the session API is unchanged.
// Built ONCE per session construction (app.ts) and rebuilt on Reset / new seeds.

import type { Config } from '../config';
import { seedToDataSet } from '../core/data';
import type { Figure } from '../core/figure';
import { loudGoldenBarChart } from '../core/fixtures';
import { scoreExact, type Breakdown } from '../core/score';

/** Sentinel selection id for the reference cell. Real trajectory ids are monotonically assigned
 *  from 0 (session contract: never reused), so −1 can never collide with one. */
export const REFERENCE_ID = -1;

/** The built + scored reference: what the gallery cell, main canvas, and score panel display. */
export interface ReferenceView {
  figure: Figure;
  breakdown: Breakdown;
}

/**
 * Build and score the reference ONCE for a session: the golden bar chart of `dataSeed`'s dataset
 * at the LOUD layout the acceptance workflow uses (core/fixtures.loudGoldenBarChart — grounded on
 * the frame axis, label-ordered x, heights ∝ value), scored with `scoreExact` under `cfg` — pass
 * the SESSION's snapshotted cfg so disabled readings and knobs apply exactly as they do to the
 * evolving trajectories.
 */
export function buildReference(dataSeed: number, cfg: Config): ReferenceView {
  const data = seedToDataSet(dataSeed);
  const figure = loudGoldenBarChart(data);
  return { figure, breakdown: scoreExact(figure, data, cfg) };
}
