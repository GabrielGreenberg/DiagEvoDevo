// src/core/figure.test.ts — M1 gate for the figure + frame.

import { describe, it, expect } from 'vitest';
import {
  seedToFigure,
  cloneFigure,
  start,
  end,
  midpoint,
  displacement,
  segBase,
  N_SEGMENTS,
} from './figure';
import { pageFromConfig, frameFromConfig, unit, perp } from './frame';
import { config, N_PARAMS } from '../config';

describe('figure: shape + determinism', () => {
  it('is a Float64Array of length 48', () => {
    const f = seedToFigure(1);
    expect(f).toBeInstanceOf(Float64Array);
    expect(f.length).toBe(N_PARAMS);
    expect(N_SEGMENTS).toBe(12);
  });
  it('same seed → identical figure; different seeds differ', () => {
    expect(Array.from(seedToFigure(7))).toEqual(Array.from(seedToFigure(7)));
    expect(Array.from(seedToFigure(1))).not.toEqual(Array.from(seedToFigure(2)));
  });
});

describe('figure: endpoints within the init box', () => {
  it('every coordinate in [min, max] across many seeds', () => {
    for (let s = 0; s < 200; s++) {
      const f = seedToFigure(s);
      for (const v of f) {
        expect(v).toBeGreaterThanOrEqual(config.figureInit.min);
        expect(v).toBeLessThanOrEqual(config.figureInit.max);
      }
    }
  });
});

describe('figure: canonical index layout + accessors', () => {
  it('segBase(i) = 4i; accessors read [sx,sy,ex,ey]', () => {
    // hand-built figure: segment 0 = (1,2)->(4,6), segment 1 = (10,10)->(0,0)
    const f = new Float64Array(N_PARAMS);
    f[0] = 1;
    f[1] = 2;
    f[2] = 4;
    f[3] = 6;
    f[4] = 10;
    f[5] = 10;
    f[6] = 0;
    f[7] = 0;
    expect(segBase(3)).toBe(12);
    expect(start(f, 0)).toEqual({ x: 1, y: 2 });
    expect(end(f, 0)).toEqual({ x: 4, y: 6 });
    expect(midpoint(f, 0)).toEqual({ x: 2.5, y: 4 });
    expect(displacement(f, 0)).toEqual({ x: 3, y: 4 }); // end − start
    expect(displacement(f, 1)).toEqual({ x: -10, y: -10 });
  });
  it('cloneFigure is a deep copy', () => {
    const f = seedToFigure(3);
    const g = cloneFigure(f);
    g[0] = f[0]! + 123;
    expect(g[0]).not.toBe(f[0]);
    expect(Array.from(f).slice(1)).toEqual(Array.from(g).slice(1));
  });
});

describe('frame: constructors + geometry helpers', () => {
  it('page has direction (no origin); frame has origin+direction from config', () => {
    const p = pageFromConfig();
    expect(p.direction).toEqual(config.pageDirection);
    expect('origin' in p).toBe(false);
    const fr = frameFromConfig();
    expect(fr.origin).toEqual(config.frame.origin);
    expect(fr.direction).toEqual(config.frame.direction);
  });
  it('unit normalizes; perp rotates +90°', () => {
    expect(unit([3, 4])).toEqual([0.6, 0.8]);
    expect(unit([0, 0])).toEqual([0, 0]); // degenerate guard
    const p1 = perp([1, 0]);
    expect(p1[0]).toBeCloseTo(0);
    expect(p1[1]).toBeCloseTo(1);
    const p2 = perp([0, 1]);
    expect(p2[0]).toBeCloseTo(-1);
    expect(p2[1]).toBeCloseTo(0);
  });
});
