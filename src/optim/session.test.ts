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
    'BOTH relations encode (balanced by per-relation normalization): value via a ratio, order via a position',
    async () => {
      const s = createSession(2, 1);
      // Run in batches, yielding to the event loop between them: a single synchronous multi-minute
      // run() starves the vitest worker's RPC channel ("Timeout calling onTaskUpdate" → exit 1
      // even with every test green). Same trajectory — step order and RNG are untouched.
      while (s.status !== 'converged') {
        s.run(200);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const b = s.breakdown();
      const sales = b.relations.find((r) => r.key === 'sales')!;
      const order = b.relations.find((r) => r.key === 'order')!;
      const rung = (m: { rungs: { name: string; f: number }[] }, name: string): number =>
        m.rungs.find((r) => r.name === name)!.f;
      // value: the best ratio carrier climbs its rungs; order: the best carrier tracks label order
      expect(rung(sales.measurements[0]!, 'ratio'), 'sales.ratio').toBeGreaterThan(0.85);
      expect(rung(order.measurements[0]!, 'ord'), 'order.ord').toBeGreaterThan(0.85);
      // neither relation is drowned — both contribute meaningfully to the normalized total
      expect(sales.normalized, 'sales normalized').toBeGreaterThan(0.4);
      expect(order.normalized, 'order normalized').toBeGreaterThan(0.4);
    },
    120000,
  );
});
