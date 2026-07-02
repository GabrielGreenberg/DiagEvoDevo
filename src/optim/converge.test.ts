// src/optim/converge.test.ts — M6 gate for the score-plateau detector.

import { describe, it, expect } from 'vitest';
import { initConvergence, pushScore } from './converge';

const cfg = {
  windowSize: 10,
  plateauEps: 1e-4,
  plateauRelEps: 3e-4,
  minSteps: 5,
  maxSteps: 1000,
  qualityThreshold: 0.9,
};

function feed(scores: number[]): { converged: boolean; step: number; byCap: boolean } {
  const st = initConvergence();
  let converged = false;
  for (const s of scores) {
    converged = pushScore(st, s, cfg);
    if (converged) break;
  }
  return { converged, step: st.step, byCap: st.byCap };
}

describe('converge: fires on a score plateau (the valley floor)', () => {
  it('a constant score converges once past minSteps with a full window', () => {
    const r = feed(new Array(50).fill(5.0));
    expect(r.converged).toBe(true);
    expect(r.byCap).toBe(false);
    expect(r.step).toBeGreaterThanOrEqual(cfg.minSteps);
    expect(r.step).toBeGreaterThanOrEqual(cfg.windowSize);
  });

  it('fires despite tiny sub-eps fluctuation (params drifting along the invariant valley)', () => {
    // score essentially flat (|Δ| < plateauEps) — mimics scale/translation drift at fixed fidelity
    const scores = Array.from({ length: 60 }, (_, i) => 5.0 + (i % 2) * 1e-6);
    expect(feed(scores).converged).toBe(true);
  });
});

describe('converge: does NOT fire on a genuine slow monotone climb (Risk 2 de-risk)', () => {
  it('a steady climb keeps the window spread above plateauEps and never plateaus early', () => {
    const scores = Array.from({ length: 200 }, (_, i) => 1 + i * 1e-4); // Δ per step = 1e-4
    const r = feed(scores);
    expect(r.converged).toBe(false); // window spread ≈ 9e-4 > plateauEps throughout
  });
});

describe('converge: plateauRelEps is read PER CHECK (live-adjustable strictness)', () => {
  // A rigged slow climb: Δ = 1e-5/step at score ≈ 1 ⇒ relative window spread ≈ 9e-5.
  // plateauEps 0 disables the absolute floor so ONLY the relative criterion is exercised.
  const slowClimb = (i: number): number => 1 + i * 1e-5;
  const relCfg = (plateauRelEps: number) => ({ ...cfg, plateauEps: 0, plateauRelEps });

  it('plateaus under a loose eps (1e-2) but NOT under a strict one (1e-5)', () => {
    const loose = initConvergence();
    const strict = initConvergence();
    let looseConv = false;
    let strictConv = false;
    for (let i = 0; i < 200; i++) {
      if (!looseConv) looseConv = pushScore(loose, slowClimb(i), relCfg(1e-2));
      strictConv = pushScore(strict, slowClimb(i), relCfg(1e-5));
    }
    expect(looseConv).toBe(true); // 9e-5 ≤ 1e-2 → flat enough, stop
    expect(loose.byCap).toBe(false);
    expect(strictConv).toBe(false); // 9e-5 > 1e-5 → still improving, keep going
  });

  it('LOOSENING mid-stream fires on the very next check; the same series never fired while strict', () => {
    const st = initConvergence();
    let converged = false;
    for (let i = 0; i < 100; i++) converged = pushScore(st, slowClimb(i), relCfg(1e-5));
    expect(converged).toBe(false); // strict: the slow climb keeps it alive
    converged = pushScore(st, slowClimb(100), relCfg(1e-2)); // user raises eps mid-run
    expect(converged).toBe(true); // next check under the looser threshold fires
    expect(st.byCap).toBe(false);
  });

  it('TIGHTENING mid-stream keeps a still-flat-under-loose series running — but never un-converges', () => {
    const stA = initConvergence();
    let convA = false;
    for (let i = 0; i < 100 && !convA; i++) convA = pushScore(stA, slowClimb(i), relCfg(1e-2));
    expect(convA).toBe(true);
    // once converged, a stricter cfg cannot un-converge it: pushScore short-circuits on converged
    expect(pushScore(stA, slowClimb(101), relCfg(1e-12))).toBe(true);
    expect(stA.converged).toBe(true);
    // whereas a NOT-yet-converged detector immediately honors the stricter threshold
    const stB = initConvergence();
    let convB = false;
    for (let i = 0; i < 50; i++) convB = pushScore(stB, slowClimb(i), relCfg(1e-5));
    for (let i = 50; i < 150; i++) convB = pushScore(stB, slowClimb(i), relCfg(1e-6));
    expect(convB).toBe(false);
  });
});

describe('converge: guards', () => {
  it('does not converge before minSteps even if flat', () => {
    const st = initConvergence();
    let converged = false;
    for (let i = 0; i < cfg.minSteps - 1; i++) converged = pushScore(st, 5.0, cfg);
    expect(converged).toBe(false);
  });

  it('caps at maxSteps (byCap) when the score never plateaus', () => {
    const scores = Array.from({ length: cfg.maxSteps + 10 }, (_, i) => i * 1e-3); // always climbing
    const r = feed(scores);
    expect(r.converged).toBe(true);
    expect(r.byCap).toBe(true);
    expect(r.step).toBe(cfg.maxSteps);
  });
});
