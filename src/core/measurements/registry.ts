// src/core/measurements/registry.ts
//
// Builds the 2×4×4 = 32-cell measurement stock, drops the 6 undefined cells, stamps the 26 live
// ones, and exposes them. Census (verified by test): 15 ratio / 6 interval / 5 cyclic.
//
// The 6 undefined cells are exactly page × {start,end,midpoint} × {magnitude,angle}: a point on the
// bare page has no origin from which to read a magnitude or bearing. A displacement is self-anchored,
// so its magnitude (= length) and angle (= tilt) stay defined even on the page — the subtle asymmetry
// that makes the census 26, not 25 (see stampOf).
//
// v2 adds the DISTINCT-CARRIER layer, `carriers(cfg)`: the audit confirmed that under the v1 frame
// (∥ page, origin 0) 10 of the 26 cells are exact extensional duplicates. Scoring over the raw
// census double-counts them and fakes "N tracking". carriers(cfg) merges extensionally-equal cells
// by STRUCTURAL rules on the configured geometry (so the dedup stays correct when frames move, M8+):
//   • displacement magnitude is anchor- AND direction-free  ⇒ page ≡ frame, always;
//   • displacement projections/angle depend only on the direction ⇒ page ≡ frame iff dirs parallel;
//   • point projections: frame ≡ page iff frame ∥ page AND frame origin = page origin (0).
// A merged carrier keeps the MAX stamp of its members (e.g. 'start x' read against the frame origin
// is ratio, not interval) and records the merged-away ids as aliases[]. The full 26-cell census
// stays intact for the theory and its tests.

import { N_ITEMS, config, type Config } from '../../config';
import type { Value } from '../autograd/engine';
import type { Figure } from '../figure';
import type { Page, PositedFrame } from '../frame';
import { pageFromConfig, frameFromConfig, unit } from '../frame';
import { ScaleType, scaleLeq } from '../scale';
import type { Anchor, Measurement, Part, Reading, UnitClass } from './types';
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

/** The unit class of a reading: bearings are radians, everything else page units. */
export function unitClassOf(reading: Reading): UnitClass {
  return reading === 'angle' ? 'angle' : 'length';
}

/**
 * Plain-English label (v2 user request — no ∥/⊥/disp/mag glyphs in the UI). Under the v1 geometry
 * (directions ∥ x-axis) projPar reads as x and projPerp as y. Frame-anchored cells are prefixed
 * 'fr·' — but a merged carrier takes the UNPREFIXED label when a page cell is among its aliases
 * (see carriers()), so the prefix only ever shows where frame and page genuinely differ.
 */
export function labelOf(anchor: Anchor, part: Part, reading: Reading): string {
  const prefix = anchor === 'frame' ? 'fr·' : '';
  if (part === 'displacement') {
    const name = { projPar: 'run', projPerp: 'rise', magnitude: 'length', angle: 'angle' }[reading];
    return `${prefix}${name}`;
  }
  const pt = { start: 'start', end: 'end', midpoint: 'mid' }[part];
  const rd = { projPar: 'x', projPerp: 'y', magnitude: 'dist', angle: 'angle' }[reading];
  return `${prefix}${pt} ${rd}`;
}

function makeMeasurement(anchor: Anchor, part: Part, reading: Reading, stamp: ScaleType): Measurement {
  const id = `${anchor}.${part}.${reading}`;
  return {
    id,
    label: labelOf(anchor, part, reading),
    anchor,
    part,
    reading,
    stamp,
    unitClass: unitClassOf(reading),
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

// ── v2 distinct-carrier layer ────────────────────────────────────────────────────

/** One DISTINCT carrier: an equivalence class of extensionally-equal measurement cells. */
export interface Carrier {
  /** Canonical id — the max-stamp member's id (ties broken toward the page anchor). */
  readonly id: string;
  /** Plain-English label; unprefixed when a page cell is in the class (it reads the same vector). */
  readonly label: string;
  /** The MAX stamp across merged members (a frame reading can upgrade a page projection to ratio). */
  readonly stamp: ScaleType;
  readonly unitClass: UnitClass;
  /** The merged-away member ids (empty when the cell is already unique). */
  readonly aliases: readonly string[];
  /** The canonical member's extraction paths (all members extract the SAME vector by construction). */
  readonly measurement: Measurement;
}

/** The extensional-equivalence class key of a cell under the configured geometry (structural). */
function classKey(m: Measurement, dirsParallel: boolean, originAtPage: boolean): string {
  if (m.part === 'displacement') {
    // magnitude ignores anchor AND direction; other displacement readings depend only on direction
    if (m.reading === 'magnitude') return 'disp.magnitude';
    if (dirsParallel) return `disp.${m.reading}`;
    return m.id;
  }
  // point parts: the frame reading subtracts the origin, so page ≡ frame only at origin 0 ∥ page —
  // and only for projections (page point magnitude/angle don't exist)
  if (dirsParallel && originAtPage && (m.reading === 'projPar' || m.reading === 'projPerp')) {
    return `point.${m.part}.${m.reading}`;
  }
  return m.id;
}

/**
 * The DEDUPED distinct-carrier set for the configured geometry. The reward, the LSE means, the
 * data-ink penalty, and the panel counts all run over THIS set, never the raw census.
 */
export function carriers(cfg: Config = config): Carrier[] {
  const frame = frameFromConfig(cfg);
  const page = pageFromConfig(cfg);
  const eps = cfg.eps.geom;
  const uf = unit(frame.direction);
  const up = unit(page.direction);
  // parallel = same direction (anti-parallel readings NEGATE, so they are not extensionally equal)
  const dirsParallel = Math.abs(uf[0] * up[1] - uf[1] * up[0]) <= eps && uf[0] * up[0] + uf[1] * up[1] > 0;
  const originAtPage = Math.abs(frame.origin[0]) <= eps && Math.abs(frame.origin[1]) <= eps;

  const groups = new Map<string, Measurement[]>();
  for (const m of REGISTRY.values()) {
    const key = classKey(m, dirsParallel, originAtPage);
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }

  const out: Carrier[] = [];
  for (const members of groups.values()) {
    // canonical = the member every other member's stamp reads down from (max stamp);
    // on a stamp tie prefer the page anchor (keeps ids like 'page.displacement.magnitude' stable)
    let canonical = members[0]!;
    for (const m of members.slice(1)) {
      if (!scaleLeq(m.stamp, canonical.stamp)) canonical = m;
      else if (m.stamp === canonical.stamp && m.anchor === 'page' && canonical.anchor === 'frame') canonical = m;
    }
    const pageMember = members.find((m) => m.anchor === 'page');
    out.push({
      id: canonical.id,
      label: (pageMember ?? canonical).label, // unprefixed where a page cell reads the same vector
      stamp: canonical.stamp,
      unitClass: canonical.unitClass,
      aliases: members.filter((m) => m !== canonical).map((m) => m.id),
      measurement: canonical,
    });
  }
  return out;
}

/** Resolve a measurement id (canonical OR merged-away alias) to its distinct carrier. */
export function carrierFor(id: string, all: readonly Carrier[]): Carrier {
  const c = all.find((k) => k.id === id || k.aliases.includes(id));
  if (!c) throw new Error(`No distinct carrier for measurement id: ${id}`);
  return c;
}
