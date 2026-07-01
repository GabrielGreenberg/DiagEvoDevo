// src/optim/gd.test.ts — M6 gate for the Adam ascent stepper.

import { describe, it, expect } from 'vitest';
import { initAdam, adamStep } from './gd';

// Maximize f(x) = −Σ (xᵢ − target)² (concave). ∇f = −2(x − target). Adam should ascend to `target`.
const target = Float64Array.from([3, -2, 10, 0.5]);
const gradOf = (x: Float64Array): Float64Array =>
  Float64Array.from(x, (xi, i) => -2 * (xi - target[i]!));
const f = (x: Float64Array): number => x.reduce((s, xi, i) => s - (xi - target[i]!) ** 2, 0);

describe('gd: Adam ASCENDS a concave objective', () => {
  it('reaches the maximizer and increases f monotonically-ish', () => {
    let x: Float64Array = new Float64Array([0, 0, 0, 0]);
    const st = initAdam(4);
    const hp = { lr: 0.1, beta1: 0.9, beta2: 0.999, eps: 1e-8 };
    const f0 = f(x);
    for (let i = 0; i < 4000; i++) x = adamStep(x, gradOf(x), st, hp);
    expect(f(x)).toBeGreaterThan(f0);
    for (let i = 0; i < 4; i++) expect(x[i]!).toBeCloseTo(target[i]!, 2);
    expect(f(x)).toBeCloseTo(0, 3); // maximum is 0
  });

  it('is deterministic (same init + grads → same trajectory)', () => {
    const run = (): Float64Array => {
      let x: Float64Array = new Float64Array([1, 1, 1, 1]);
      const st = initAdam(4);
      for (let i = 0; i < 50; i++) x = adamStep(x, gradOf(x), st);
      return x;
    };
    expect(Array.from(run())).toEqual(Array.from(run()));
  });
});
