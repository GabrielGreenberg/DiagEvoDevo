// src/core/autograd/engine.test.ts
//
// Adversarial tests for the reverse-mode engine: the classic micrograd correctness traps
// (shared leaves / fan-out with += accumulation, duplicate operands, diamond graphs), backward
// re-zeroing, and stack safety on a deep graph (guards the iterative topo-sort requirement).

import { describe, it, expect } from 'vitest';
import { Value, val, add, sub, mul, div, backward } from './engine';

describe('engine: forward + basic grads', () => {
  it('add/mul/div forward values and gradients', () => {
    const a = val(3);
    const b = val(4);
    const y = add(mul(a, b), div(a, b)); // 12 + 0.75
    expect(y.data).toBeCloseTo(12.75, 12);
    backward(y);
    // dy/da = b + 1/b = 4.25 ; dy/db = a − a/b² = 3 − 3/16 = 2.8125
    expect(a.grad).toBeCloseTo(4.25, 12);
    expect(b.grad).toBeCloseTo(2.8125, 12);
  });
});

describe('engine: fan-out and shared leaves (the += trap)', () => {
  it('x*x has gradient 2x (duplicate operand in one op)', () => {
    const x = val(3.5);
    const y = mul(x, x);
    backward(y);
    expect(y.data).toBeCloseTo(12.25, 12);
    expect(x.grad).toBeCloseTo(7, 12); // 2x
  });

  it('x - x = 0 with gradient 0 (array _prev keeps both edges)', () => {
    const x = val(2.3);
    const y = sub(x, x);
    backward(y);
    expect(y.data).toBe(0);
    expect(x.grad).toBeCloseTo(0, 12);
  });

  it('x*x + x*x*x has gradient 2x + 3x² (shared leaf, multiple paths)', () => {
    const x = val(2);
    const y = add(mul(x, x), mul(mul(x, x), x));
    backward(y);
    expect(y.data).toBeCloseTo(12, 12); // 4 + 8
    expect(x.grad).toBeCloseTo(2 * 2 + 3 * 2 * 2, 12); // 4 + 12 = 16
  });

  it('diamond graph: t=a+b, y=t*t sums both paths into a and b', () => {
    const a = val(1.5);
    const b = val(0.5);
    const t = add(a, b); // 2
    const y = mul(t, t); // 4
    backward(y);
    // dy/da = dy/db = 2t = 4
    expect(a.grad).toBeCloseTo(4, 12);
    expect(b.grad).toBeCloseTo(4, 12);
  });
});

describe('engine: backward re-zeroes (no cross-call accumulation)', () => {
  it('calling backward twice gives the same grad, not double', () => {
    const x = val(3);
    const y = mul(x, x);
    backward(y);
    const g1 = x.grad;
    backward(y);
    const g2 = x.grad;
    expect(g1).toBeCloseTo(6, 12);
    expect(g2).toBeCloseTo(6, 12); // re-zeroed, not 12
  });
});

describe('engine: stack safety on deep graphs (iterative topo-sort)', () => {
  it('a 50000-node additive chain backprops without overflow, grad = 1', () => {
    const x = val(0);
    let f: Value = x;
    for (let i = 0; i < 50000; i++) f = add(f, val(1));
    expect(f.data).toBe(50000);
    expect(() => backward(f)).not.toThrow();
    expect(x.grad).toBeCloseTo(1, 12);
  });

  it('a deep multiplicative chain backprops correctly', () => {
    const x = val(1);
    let f: Value = x;
    const k = 1.0001;
    const n = 20000;
    for (let i = 0; i < n; i++) f = mul(f, val(k));
    // f = x·k^n ; df/dx = k^n
    expect(() => backward(f)).not.toThrow();
    expect(x.grad).toBeCloseTo(Math.pow(k, n), 6);
  });
});
