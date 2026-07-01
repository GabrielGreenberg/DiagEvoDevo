// src/core/autograd/gradcheck.ts
//
// Finite-difference verification of the autograd engine. This is the ONLY role finite differences
// play (ARCHITECTURE.md §Gradient strategy): they are how we TRUST the engine, not how we compute
// gradients. Backs the `gradcheck` workflow.
//
// A gradient checker that never fails is worthless — the accompanying test suite feeds this a
// deliberately-wrong op and asserts it is caught.

import { Value, val, backward } from './engine';

/** Central difference ∂f/∂xᵢ ≈ (f(x+h eᵢ) − f(x−h eᵢ)) / 2h. O(h²) error. */
export function centralDiff(f: (x: number[]) => number, x: number[], h: number): number[] {
  const g = new Array<number>(x.length);
  for (let i = 0; i < x.length; i++) {
    const xp = x.slice();
    const xm = x.slice();
    xp[i]! += h;
    xm[i]! -= h;
    g[i] = (f(xp) - f(xm)) / (2 * h);
  }
  return g;
}

/** Relative L2 error ‖a−b‖ / (‖a‖+‖b‖+tiny). Scale-free ⇒ one tolerance works across ops. */
export function relL2(a: number[], b: number[]): number {
  let dd = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    dd += d * d;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return Math.sqrt(dd) / (Math.sqrt(na) + Math.sqrt(nb) + 1e-30);
}

export function maxAbsDiff(a: number[], b: number[]): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}

export interface GradcheckReport {
  adGrad: number[];
  fdGrad: number[];
  relL2: number;
  maxAbs: number;
  pass: boolean;
}

/**
 * Gradcheck an arbitrary scalar-valued graph builder. `build(leaves)` constructs the graph from
 * a set of leaf Values and returns the scalar output Value. We reuse the SAME builder for the
 * numeric forward (reading `.data`), so the AD path and the FD path are provably the same formula.
 */
export function gradcheckBuild(
  build: (leaves: Value[]) => Value,
  x: number[],
  opts: { h: number; tol: number },
): GradcheckReport {
  const leaves = x.map((v) => val(v));
  const out = build(leaves);
  backward(out);
  const adGrad = leaves.map((l) => l.grad);
  const f = (xn: number[]): number => build(xn.map((v) => val(v))).data;
  const fdGrad = centralDiff(f, x, opts.h);
  const rel = relL2(adGrad, fdGrad);
  return { adGrad, fdGrad, relL2: rel, maxAbs: maxAbsDiff(adGrad, fdGrad), pass: rel < opts.tol };
}
