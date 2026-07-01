// src/core/measurements/measurements.test.ts — M2 gate for the measurement stock.

import { describe, it, expect } from 'vitest';
import { val, type Value } from '../autograd/engine';
import { seedToFigure } from '../figure';
import type { Page, PositedFrame } from '../frame';
import { pageFromConfig } from '../frame';
import { ScaleType } from '../scale';
import { ANCHORS, PARTS, READINGS } from './types';
import {
  REGISTRY,
  UNDEFINED_IDS,
  LIVE_COUNT,
  stampOf,
  getMeasurement,
  liveMeasurements,
} from './registry';
import { N_ITEMS } from '../../config';

const leavesOf = (f: Float64Array): Value[] => Array.from(f, (x) => val(x));

describe('measurements: exactly 26 live of 32', () => {
  it('registry has 26 entries', () => {
    expect(REGISTRY.size).toBe(26);
    expect(LIVE_COUNT).toBe(26);
    expect(liveMeasurements().length).toBe(26);
  });

  it('the 6 undefined are exactly page × {start,end,midpoint} × {magnitude,angle}', () => {
    const expectedUndefined = new Set<string>();
    for (const part of ['start', 'end', 'midpoint']) {
      for (const reading of ['magnitude', 'angle']) {
        expectedUndefined.add(`page.${part}.${reading}`);
      }
    }
    expect(new Set(UNDEFINED_IDS)).toEqual(expectedUndefined);
    expect(UNDEFINED_IDS.length).toBe(6);
    // and none of them is a registry key
    for (const id of UNDEFINED_IDS) expect(REGISTRY.has(id)).toBe(false);
  });

  it('stampOf is defined for exactly 26 of the 32 cells', () => {
    let defined = 0;
    let undef = 0;
    for (const anchor of ANCHORS) {
      for (const part of PARTS) {
        for (const reading of READINGS) {
          if (stampOf(anchor, part, reading) === undefined) undef++;
          else defined++;
        }
      }
    }
    expect(defined).toBe(26);
    expect(undef).toBe(6);
  });
});

describe('measurements: scale census is 15 ratio / 6 interval / 5 cyclic', () => {
  it('counts each bucket', () => {
    const counts: Record<string, number> = { ratio: 0, interval: 0, cyclic: 0, ordinal: 0 };
    for (const m of liveMeasurements()) counts[m.stamp]!++;
    expect(counts[ScaleType.Ratio]).toBe(15);
    expect(counts[ScaleType.Interval]).toBe(6);
    expect(counts[ScaleType.Cyclic]).toBe(5);
    expect(counts[ScaleType.Ordinal]).toBe(0); // no measurement is ordinal-stamped
  });
});

describe('measurements: length is anchor-free (the 26→25 collapse)', () => {
  it('page.displacement.magnitude == frame.displacement.magnitude for ANY frame', () => {
    const pageM = getMeasurement('page.displacement.magnitude');
    const frameM = getMeasurement('frame.displacement.magnitude');
    const page: Page = pageFromConfig();
    // arbitrary rotated frame with nonzero origin — magnitude must be invariant to both
    const frame: PositedFrame = { origin: [37, -12], direction: [Math.cos(0.7), Math.sin(0.7)] };
    for (let s = 0; s < 30; s++) {
      const f = seedToFigure(s);
      const a = pageM.extract(f, frame, page);
      const b = frameM.extract(f, frame, page);
      for (let i = 0; i < N_ITEMS; i++) expect(a[i]!).toBeCloseTo(b[i]!, 9);
    }
  });
});

describe('measurements: run/rise/tilt coincide across anchors iff frame ∥ page', () => {
  const page = pageFromConfig(); // direction [1,0]
  const f = seedToFigure(5);
  const trio = ['projPar', 'projPerp', 'angle'] as const;
  it('EQUAL under an aligned frame (direction ∥ page)', () => {
    const frame: PositedFrame = { origin: [0, 0], direction: [1, 0] };
    for (const reading of trio) {
      const a = getMeasurement(`page.displacement.${reading}`).extract(f, frame, page);
      const b = getMeasurement(`frame.displacement.${reading}`).extract(f, frame, page);
      for (let i = 0; i < N_ITEMS; i++) expect(a[i]!).toBeCloseTo(b[i]!, 9);
    }
  });
  it('DIFFER under a rotated frame', () => {
    const frame: PositedFrame = { origin: [0, 0], direction: [Math.cos(0.6), Math.sin(0.6)] };
    let sawDifference = false;
    for (const reading of trio) {
      const a = getMeasurement(`page.displacement.${reading}`).extract(f, frame, page);
      const b = getMeasurement(`frame.displacement.${reading}`).extract(f, frame, page);
      for (let i = 0; i < N_ITEMS; i++) {
        if (Math.abs(a[i]! - b[i]!) > 1e-6) sawDifference = true;
      }
    }
    expect(sawDifference).toBe(true);
  });
});

describe('measurements: reading geometry sanity', () => {
  it('projPar² + projPerp² = magnitude² for displacement (both anchors)', () => {
    const f = seedToFigure(9);
    for (const anchor of ['page', 'frame'] as const) {
      const par = getMeasurement(`${anchor}.displacement.projPar`).extract(f);
      const perp = getMeasurement(`${anchor}.displacement.projPerp`).extract(f);
      const mag = getMeasurement(`${anchor}.displacement.magnitude`).extract(f);
      for (let i = 0; i < N_ITEMS; i++) {
        expect(par[i]! * par[i]! + perp[i]! * perp[i]!).toBeCloseTo(mag[i]! * mag[i]!, 6);
      }
    }
  });

  it('angle of a horizontal displacement is 0, vertical is ±π/2 (page dir [1,0])', () => {
    // hand-built: seg0 horizontal (3,0), seg1 vertical (0,5)
    const f = new Float64Array(48);
    f[2] = 3; // seg0 end.x (start at origin) → displacement (3,0)
    f[4] = 0;
    f[5] = 0;
    f[7] = 5; // seg1 end.y → displacement (0,5)
    const ang = getMeasurement('page.displacement.angle').extract(f);
    expect(ang[0]!).toBeCloseTo(0, 9);
    expect(Math.abs(ang[1]!)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('page.start.projPar is the start x-position', () => {
    const f = seedToFigure(2);
    const xpos = getMeasurement('page.start.projPar').extract(f);
    for (let i = 0; i < N_ITEMS; i++) expect(xpos[i]!).toBeCloseTo(f[i * 4]!, 12);
  });
});

describe('measurements: differentiable path matches plain path (one code path)', () => {
  it('extractValue(leaves).data ≈ extract(f) for every live measurement', () => {
    for (let s = 0; s < 10; s++) {
      const f = seedToFigure(s + 100);
      const leaves = leavesOf(f);
      for (const m of liveMeasurements()) {
        const plain = m.extract(f);
        const diff = m.extractValue(leaves);
        for (let i = 0; i < N_ITEMS; i++) {
          expect(diff[i]!.data, `${m.id}[${i}]`).toBeCloseTo(plain[i]!, 9);
        }
      }
    }
  });
});

describe('measurements: cross-reading vectors are unconstructable (structural)', () => {
  it('each measurement fixes exactly one (anchor,part,reading); ids unique', () => {
    const seen = new Set<string>();
    for (const m of liveMeasurements()) {
      const key = `${m.anchor}.${m.part}.${m.reading}`;
      expect(m.id).toBe(key);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      // extract yields a homogeneous length-12 vector of ONE reading — no way to mix readings
      expect(m.extract(seedToFigure(1)).length).toBe(N_ITEMS);
    }
    expect(seen.size).toBe(26);
  });
});
