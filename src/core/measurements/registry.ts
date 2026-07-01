// src/core/measurements/registry.ts
//
// Builds the 2×4×4 = 32-cell measurement stock, drops the 6 undefined cells, stamps the 26 live
// ones, and exposes them. Census (verified by test): 15 ratio / 6 interval / 5 cyclic.
//
// The 6 undefined cells are exactly page × {start,end,midpoint} × {magnitude,angle}: a point on the
// bare page has no origin from which to read a magnitude or bearing. A displacement is self-anchored,
// so its magnitude (= length) and angle (= tilt) stay defined even on the page — the subtle asymmetry
// that makes the census 26, not 25 (see stampOf).

import { N_ITEMS } from '../../config';
import type { Value } from '../autograd/engine';
import type { Figure } from '../figure';
import type { Page, PositedFrame } from '../frame';
import { pageFromConfig, frameFromConfig } from '../frame';
import { ScaleType } from '../scale';
import type { Anchor, Measurement, Part, Reading } from './types';
import { ANCHORS, PARTS, READINGS } from './types';
import { partVector, readScalar, partVectorV, readScalarV, anchorDir } from './readings';

/**
 * The scale-type stamp of a cell, or undefined if the cell is not a legal measurement.
 * The single source of truth for the census.
 */
export function stampOf(anchor: Anchor, part: Part, reading: Reading): ScaleType | undefined {
  // Page-anchored POINT: no origin ⇒ only projections are defined, and they are INTERVAL
  // (a position on an infinite page has no true zero). magnitude/angle of a point are undefined.
  if (anchor === 'page' && part !== 'displacement') {
    if (reading === 'projPar' || reading === 'projPerp') return ScaleType.Interval;
    return undefined; // magnitude, angle → the 6 undefined cells
  }
  // Otherwise we measure a DIFFERENCE (a displacement, or a point relative to a frame origin):
  // a true zero is present. Bearings are cyclic; projections and magnitudes are ratio.
  if (reading === 'angle') return ScaleType.Cyclic;
  return ScaleType.Ratio; // projPar, projPerp, magnitude
}

function makeMeasurement(anchor: Anchor, part: Part, reading: Reading, stamp: ScaleType): Measurement {
  const id = `${anchor}.${part}.${reading}`;
  return {
    id,
    anchor,
    part,
    reading,
    stamp,
    extract(f: Figure, frame: PositedFrame = frameFromConfig(), page: Page = pageFromConfig()) {
      const dir = anchorDir(anchor, page.direction, frame.direction);
      const out = new Float64Array(N_ITEMS);
      for (let i = 0; i < N_ITEMS; i++) {
        out[i] = readScalar(partVector(f, i, anchor, part, frame), reading, dir);
      }
      return out;
    },
    extractValue(leaves: Value[], frame: PositedFrame = frameFromConfig(), page: Page = pageFromConfig()) {
      const dir = anchorDir(anchor, page.direction, frame.direction);
      const out: Value[] = new Array(N_ITEMS);
      for (let i = 0; i < N_ITEMS; i++) {
        out[i] = readScalarV(partVectorV(leaves, i, anchor, part, frame), reading, dir);
      }
      return out;
    },
  };
}

/** All 26 live measurements keyed by id, built fresh. */
export function buildRegistry(): ReadonlyMap<string, Measurement> {
  const map = new Map<string, Measurement>();
  for (const anchor of ANCHORS) {
    for (const part of PARTS) {
      for (const reading of READINGS) {
        const stamp = stampOf(anchor, part, reading);
        if (stamp === undefined) continue;
        const m = makeMeasurement(anchor, part, reading, stamp);
        map.set(m.id, m);
      }
    }
  }
  return map;
}

/** The default registry (config anchors). */
export const REGISTRY: ReadonlyMap<string, Measurement> = buildRegistry();

export const LIVE_COUNT = 26;

/** The 6 undefined cell ids, computed (not hard-coded) so the test can diff against the product. */
export const UNDEFINED_IDS: readonly string[] = (() => {
  const ids: string[] = [];
  for (const anchor of ANCHORS) {
    for (const part of PARTS) {
      for (const reading of READINGS) {
        if (stampOf(anchor, part, reading) === undefined) ids.push(`${anchor}.${part}.${reading}`);
      }
    }
  }
  return ids;
})();

export function getMeasurement(id: string): Measurement {
  const m = REGISTRY.get(id);
  if (!m) throw new Error(`Unknown measurement id: ${id}`);
  return m;
}

export function liveMeasurements(): Measurement[] {
  return [...REGISTRY.values()];
}
