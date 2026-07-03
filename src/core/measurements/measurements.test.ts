// src/core/measurements/measurements.test.ts — gate for the measurement stock + v2 carrier dedup.

import { describe, it, expect } from 'vitest';
import { val, type Value } from '../autograd/engine';
import { seedToFigure } from '../figure';
import type { Page, PositedFrame } from '../frame';
import { pageFromConfig } from '../frame';
import { ScaleType, commensurability } from '../scale';
import { ANCHORS, PARTS, READINGS } from './types';
import {
  REGISTRY,
  UNDEFINED_IDS,
  LIVE_COUNT,
  stampOf,
  getMeasurement,
  liveMeasurements,
  carriers,
  allCarriers,
  carrierFor,
  canonicalDisabledIds,
} from './registry';
import { N_ITEMS, config, type Config } from '../../config';

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

describe('measurements: plain-English labels + unit classes (v2)', () => {
  it('page cells carry the canonical plain labels; frame cells are fr·-prefixed', () => {
    const expected: Record<string, string> = {
      'page.start.projPar': 'start x',
      'page.start.projPerp': 'start y',
      'page.end.projPar': 'end x',
      'page.end.projPerp': 'end y',
      'page.midpoint.projPar': 'mid x',
      'page.midpoint.projPerp': 'mid y',
      'page.displacement.projPar': 'run',
      'page.displacement.projPerp': 'rise',
      'page.displacement.magnitude': 'length',
      'page.displacement.angle': 'angle',
      'frame.start.projPar': 'fr·start x',
      'frame.start.magnitude': 'fr·start dist',
      'frame.midpoint.angle': 'fr·mid angle',
      'frame.displacement.magnitude': 'fr·length',
    };
    for (const [id, label] of Object.entries(expected)) {
      expect(getMeasurement(id).label, id).toBe(label);
    }
    // every live cell has a nonempty label with NO raw glyph tokens
    for (const m of liveMeasurements()) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.label).not.toMatch(/projPar|projPerp|magnitude|displacement/);
    }
  });
  it('unitClass: angle readings are radians, all else page-unit lengths', () => {
    for (const m of liveMeasurements()) {
      expect(m.unitClass).toBe(m.reading === 'angle' ? 'angle' : 'length');
    }
  });
});

describe('measurements: v2 distinct-carrier dedup (audit: 10 of 26 cells were exact duplicates)', () => {
  const golden = (cfg: Config = config): ReturnType<typeof carriers> => carriers(cfg);

  it('default geometry (frame ∥ page at origin) dedupes 26 → 16 distinct carriers', () => {
    const all = golden();
    expect(all.length).toBe(16);
    // every registry cell is accounted for exactly once (canonical or alias)
    const seen = new Set<string>();
    for (const c of all) {
      seen.add(c.id);
      for (const a of c.aliases) {
        expect(seen.has(a)).toBe(false);
        seen.add(a);
      }
    }
    expect(seen.size).toBe(26);
  });

  it('merged point projections keep the MAX stamp (ratio via the frame) and the plain label', () => {
    const all = golden();
    const startX = carrierFor('page.start.projPar', all);
    expect(startX.id).toBe('frame.start.projPar'); // canonical = max-stamp member
    expect(startX.stamp).toBe(ScaleType.Ratio); // upgraded from the page cell's interval
    expect(startX.label).toBe('start x'); // unprefixed: a page cell reads the same vector
    expect(startX.aliases).toEqual(['page.start.projPar']);
  });

  it('displacement cells merge with the PAGE cell canonical (stamps tie); magnitude always merges', () => {
    const all = golden();
    const len = carrierFor('frame.displacement.magnitude', all);
    expect(len.id).toBe('page.displacement.magnitude');
    expect(len.label).toBe('length');
    expect(len.aliases).toEqual(['frame.displacement.magnitude']);
    const run = carrierFor('frame.displacement.projPar', all);
    expect(run.id).toBe('page.displacement.projPar');
    expect(run.label).toBe('run');
  });

  it('the dedup is STRUCTURAL: a rotated frame keeps only the magnitude merge (26 → 25)', () => {
    const rotated: Config = {
      ...config,
      frame: { ...config.frame, origin: [0, 0], direction: [Math.cos(0.6), Math.sin(0.6)] },
    };
    const all = golden(rotated);
    expect(all.length).toBe(25); // only |displacement| is direction-free
    expect(carrierFor('frame.displacement.magnitude', all).id).toBe('page.displacement.magnitude');
    // point projections now genuinely differ → both anchors present as distinct carriers
    expect(all.some((c) => c.id === 'page.start.projPar' && c.aliases.length === 0)).toBe(true);
    expect(all.some((c) => c.id === 'frame.start.projPar' && c.aliases.length === 0)).toBe(true);
  });

  it('a shifted frame (∥ page, origin ≠ 0) unmerges the point projections but not displacement', () => {
    const shifted: Config = { ...config, frame: { ...config.frame, origin: [10, 0] } };
    const all = golden(shifted);
    expect(all.length).toBe(26 - 4); // the 4 displacement merges survive; 6 point merges do not
    expect(all.some((c) => c.id === 'page.start.projPar' && c.aliases.length === 0)).toBe(true);
  });

  it('an ANTI-parallel frame does NOT merge projections (they negate, not equal)', () => {
    const anti: Config = { ...config, frame: { origin: [0, 0], direction: [-1, 0] } };
    const all = golden(anti);
    expect(all.length).toBe(25); // magnitude only
  });

  it('merged members are extensionally EQUAL on random figures (the merge is sound)', () => {
    const all = golden();
    for (const c of all) {
      for (const aliasId of c.aliases) {
        const alias = getMeasurement(aliasId);
        for (let s = 0; s < 5; s++) {
          const f = seedToFigure(s + 40);
          const a = c.measurement.extract(f);
          const b = alias.extract(f);
          for (let i = 0; i < N_ITEMS; i++) expect(a[i]!, `${c.id}≡${aliasId}[${i}]`).toBeCloseTo(b[i]!, 9);
        }
      }
    }
  });

  it('carrierFor resolves canonical ids AND aliases; unknown ids throw', () => {
    const all = golden();
    expect(carrierFor('page.displacement.magnitude', all).id).toBe('page.displacement.magnitude');
    expect(carrierFor('frame.end.projPerp', all).id).toBe('frame.end.projPerp');
    expect(() => carrierFor('page.nothing.here', all)).toThrow(/No distinct carrier/);
  });

  it('distinct census: 12 ratio + 4 cyclic under the default geometry; BOTH relations see all 16 (v2.2)', () => {
    const all = golden();
    const byStamp: Record<string, number> = { ratio: 0, cyclic: 0, interval: 0, ordinal: 0 };
    for (const c of all) byStamp[c.stamp]!++;
    expect(byStamp[ScaleType.Ratio]).toBe(12); // 6 point projections + 3 point dists + run/rise/length
    expect(byStamp[ScaleType.Cyclic]).toBe(4); // 3 point angles + tilt
    expect(byStamp[ScaleType.Interval]).toBe(0); // every page projection was upgraded by its frame twin
    // v2.2 (ratio ≤ cyclic restored): sales is commensurable with EVERY distinct carrier under the
    // default geometry — no reading is structurally blocked from any relation (user directive).
    expect(all.filter((c) => commensurability(ScaleType.Ratio, c.stamp)).length).toBe(16);
    expect(all.filter((c) => commensurability(ScaleType.Ordinal, c.stamp)).length).toBe(16);
  });
});

describe('measurements: carrier toggles (cfg.carriers.disabled — the exploration filter)', () => {
  const withOff = (disabled: string[], base: Config = config): Config => ({
    ...base,
    carriers: { disabled },
  });

  it('default (nothing disabled): carriers() === allCarriers() — the filter is the identity', () => {
    expect(carriers(config).map((c) => c.id)).toEqual(allCarriers(config).map((c) => c.id));
    expect(carriers(config).length).toBe(16);
  });

  it('disabling a merged carrier by CANONICAL id removes it AND its aliases from the census', () => {
    const cfg = withOff(['page.displacement.magnitude']); // 'length' (alias frame.displacement.magnitude)
    const act = carriers(cfg);
    expect(act.length).toBe(15);
    // the disabled reading is gone in every form: canonical id, alias, carrierFor resolution
    expect(act.some((c) => c.id === 'page.displacement.magnitude')).toBe(false);
    expect(act.some((c) => c.aliases.includes('frame.displacement.magnitude'))).toBe(false);
    expect(() => carrierFor('page.displacement.magnitude', act)).toThrow(/No distinct carrier/);
    expect(() => carrierFor('frame.displacement.magnitude', act)).toThrow(/No distinct carrier/);
    // …and allCarriers still lists it (the toggle UI must be able to re-enable it)
    expect(allCarriers(cfg).some((c) => c.id === 'page.displacement.magnitude')).toBe(true);
  });

  it('disabling by a merged-away ALIAS id removes the same carrier (lenient resolution)', () => {
    const act = carriers(withOff(['frame.displacement.magnitude']));
    expect(act.length).toBe(15);
    expect(act.some((c) => c.id === 'page.displacement.magnitude')).toBe(false);
  });

  it('census math shrinks CONSISTENTLY: stamp buckets lose exactly the disabled members', () => {
    // mid x/y (ratio, canonical frame.midpoint.proj*) + tilt (cyclic 'angle') + run/rise (ratio)
    const cfg = withOff([
      'frame.midpoint.projPar',
      'frame.midpoint.projPerp',
      'page.displacement.angle',
      'page.displacement.projPar',
      'page.displacement.projPerp',
    ]);
    const act = carriers(cfg);
    expect(act.length).toBe(11);
    const byStamp: Record<string, number> = { ratio: 0, cyclic: 0, interval: 0, ordinal: 0 };
    for (const c of act) byStamp[c.stamp]!++;
    expect(byStamp[ScaleType.Ratio]).toBe(8); // 12 − mid x − mid y − run − rise
    expect(byStamp[ScaleType.Cyclic]).toBe(3); // 4 − tilt
  });

  it('unknown / stale ids in the disabled list are ignored harmlessly', () => {
    const act = carriers(withOff(['no.such.reading', 'page.start.magnitude']));
    expect(act.length).toBe(16);
  });

  it("FIXED-mode guard: a disabled id that is a configured fixedCarrier is IGNORED for that carrier", () => {
    const fixedCfg: Config = { ...config, scoring: 'fixed' };
    const cfg = withOff(
      [config.fixedCarriers.sales, config.fixedCarriers.order, 'page.displacement.angle'],
      fixedCfg,
    );
    const act = carriers(cfg);
    // both fixed carriers survive (sales = length; order = start x resolves via its alias)…
    expect(carrierFor(config.fixedCarriers.sales, act).id).toBe('page.displacement.magnitude');
    expect(carrierFor(config.fixedCarriers.order, act).id).toBe('frame.start.projPar');
    // …while a NON-fixed disabled reading is still dropped (the guard is per-carrier, not global)
    expect(act.some((c) => c.id === 'page.displacement.angle')).toBe(false);
    expect(act.length).toBe(15);
    // in COMPREHENSIVE mode the same disable list really does drop the fixed ids (no guard)
    expect(carriers(withOff([config.fixedCarriers.sales, config.fixedCarriers.order])).length).toBe(14);
  });

  it('disabling EVERYTHING empties the census (guards downstream must cope — see score tests)', () => {
    const cfg = withOff(allCarriers(config).map((c) => c.id));
    expect(carriers(cfg)).toEqual([]);
  });

  it('canonicalDisabledIds: aliases resolve to canonical ids, garbage drops, duplicates collapse', () => {
    // alias → canonical (the strip keys chips by canonical id; without this a stored alias would
    // exclude a reading whose chip still renders "on")
    expect(canonicalDisabledIds(['frame.displacement.magnitude'])).toEqual([
      'page.displacement.magnitude',
    ]);
    // canonical passes through; alias+canonical of the SAME carrier collapse to one entry
    expect(
      canonicalDisabledIds(['page.displacement.magnitude', 'frame.displacement.magnitude']),
    ).toEqual(['page.displacement.magnitude']);
    // unknown/stale ids drop out entirely (they can never match a chip OR the census filter)
    expect(canonicalDisabledIds(['no.such.reading', 'frame.midpoint.angle'])).toEqual([
      'frame.midpoint.angle',
    ]);
    expect(canonicalDisabledIds([])).toEqual([]);
    // COHERENCE: the canonicalized set filters the census exactly like the raw lenient set
    const raw = ['frame.displacement.magnitude', 'no.such.reading', 'frame.midpoint.projPar'];
    expect(carriers(withOff(canonicalDisabledIds(raw))).map((c) => c.id)).toEqual(
      carriers(withOff(raw)).map((c) => c.id),
    );
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
