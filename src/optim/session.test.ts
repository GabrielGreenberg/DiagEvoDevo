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
  it('same seeds → identical trajectory (all randomness is seeded)', () => {
    expect(Array.from(runN(3, 1, 200))).toEqual(Array.from(runN(3, 1, 200)));
  });
  it('different figure seeds → different trajectory', () => {
    expect(Array.from(runN(3, 1, 200))).not.toEqual(Array.from(runN(4, 1, 200)));
  });
  it('reset restores the seeded initial state', () => {
    const s = createSession(2, 1);
    const init = Float64Array.from(s.figure);
    for (let i = 0; i < 300; i++) s.step();
    expect(Array.from(s.figure)).not.toEqual(Array.from(init));
    s.reset();
    expect(s.steps).toBe(0);
    expect(s.status).toBe('idle');
    expect(Array.from(s.figure)).toEqual(Array.from(init));
  });
});

describe('session: temperature annealing', () => {
  it('starts hot and cools toward config.T', () => {
    const s = createSession(1, 1);
    expect(s.temperature()).toBeCloseTo(config.anneal.tStart, 6);
    for (let i = 0; i < 600; i++) s.step();
    expect(s.temperature()).toBeLessThan(config.anneal.tStart); // cooled
    expect(s.temperature()).toBeGreaterThanOrEqual(config.T - 1e-9); // never below the floor
  });
});

describe('session: converges to a faithful bar chart (the v1 gate)', () => {
  it(
    'reaches high quality with all three sales rungs and the order rung ≈ 1',
    () => {
      for (const seed of [2, 5]) {
        const s = createSession(seed, 1);
        s.run();
        const b = s.breakdown();
        expect(b.quality, `seed ${seed} quality`).toBeGreaterThan(0.9);
        const sales = b.assignments.find((a) => a.key === 'sales')!;
        const order = b.assignments.find((a) => a.key === 'order')!;
        const rung = (a: typeof sales, name: string): number =>
          a.rungs.find((r) => r.name === name)!.f;
        expect(rung(sales, 'ratio'), `seed ${seed} sales.ratio`).toBeGreaterThan(0.9);
        expect(rung(sales, 'int'), `seed ${seed} sales.int`).toBeGreaterThan(0.9);
        expect(rung(order, 'ord'), `seed ${seed} order.ord`).toBeGreaterThan(0.9);
      }
    },
    90000,
  );
});
