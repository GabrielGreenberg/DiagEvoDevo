// src/optim/session.test.ts — M6 integration gate for the orchestrator.
// (Breadth across many seeds is evidenced by `npm run bench`; here we check determinism, reset, and
//  that a run converges to a faithful bar chart — all three rungs of sales + the order rung.)

import { describe, it, expect } from 'vitest';
import { createSession } from './session';
import { config } from '../config';

const runN = (seed: number, dataSeed: number, n: number): Float64Array => {
  const s = createSession(seed, dataSeed);
  for (let i = 0; i < n; i++) s.step();
  return Float64Array.from(s.figure);
};

describe('session: reproducibility + reset', () => {
  it('same seeds → identical trajectory (all randomness is seeded)', { timeout: 30000 }, () => {
    expect(Array.from(runN(3, 1, 60))).toEqual(Array.from(runN(3, 1, 60)));
  });
  it('different figure seeds → different trajectory', { timeout: 30000 }, () => {
    expect(Array.from(runN(3, 1, 60))).not.toEqual(Array.from(runN(4, 1, 60)));
  });
  it('reset restores the seeded initial state', { timeout: 30000 }, () => {
    const s = createSession(2, 1);
    const init = Float64Array.from(s.figure);
    for (let i = 0; i < 80; i++) s.step();
    expect(Array.from(s.figure)).not.toEqual(Array.from(init));
    s.reset();
    expect(s.steps).toBe(0);
    expect(s.status).toBe('idle');
    expect(Array.from(s.figure)).toEqual(Array.from(init));
  });
});

describe('session: temperature annealing', () => {
  it('starts hot and cools toward config.T', { timeout: 30000 }, () => {
    const s = createSession(1, 1);
    expect(s.temperature()).toBeCloseTo(config.anneal.tStart, 6);
    for (let i = 0; i < 300; i++) s.step();
    expect(s.temperature()).toBeLessThan(config.anneal.tStart); // cooled
    expect(s.temperature()).toBeGreaterThanOrEqual(config.T - 1e-9); // never below the floor
  });
});

describe('session: converges to a faithful bar chart (the v1 gate)', () => {
  it(
    'sales is richly encoded — its best measurement climbs all three rungs, and MANY ratios track it',
    () => {
      const s = createSession(2, 1);
      s.run();
      const b = s.breakdown();
      const sales = b.relations.find((r) => r.key === 'sales')!;
      const bestSales = sales.measurements[0]!; // sorted by reward, best first
      const rung = (m: { rungs: { name: string; f: number }[] }, name: string): number =>
        m.rungs.find((r) => r.name === name)!.f;
      expect(rung(bestSales, 'ratio')).toBeGreaterThan(0.9);
      expect(rung(bestSales, 'int')).toBeGreaterThan(0.9);
      // several ratio measurements track sales at once (the rich full-matrix homomorphism)
      const tracking = sales.measurements.filter((m) => rung(m, 'ratio') >= 0.9).length;
      expect(tracking).toBeGreaterThanOrEqual(3);
    },
    120000,
  );
});
