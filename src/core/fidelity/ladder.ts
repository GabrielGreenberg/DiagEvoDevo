// src/core/fidelity/ladder.ts
//
// The fidelity ladder (CONCEPT.md §6): three nested rungs of increasing strictness comparing an
// assigned figure measurement c ∈ ℝ¹² to a data vector v ∈ ℝ¹². Perfect ratio ⇒ perfect interval ⇒
// perfect order. Each rung has a DIFFERENTIABLE form (the optimized path, over the Value type) and an
// EXACT display form (plain numbers, for the score panel).
//
// The one place the two forms genuinely differ in VALUE is F_ord: display uses Kendall τ, the
// optimizer uses the logistic surrogate; they agree only as T→0. Everywhere else the two forms are
// the same formula (Value vs number), and a test pins fXExact ≈ fX(...).data.

import { Value, val, sub, mul, div, neg, exp, log, sigmoid } from '../autograd/engine';
import { mean, variance, r2 } from '../autograd/ops';

// ── differentiable forms (the optimized path) ───────────────────────────────────

/**
 * Ordinal rung, differentiable surrogate:
 *   F_ord ≈ mean_{i<j} σ( sign(vᵢ−vⱼ) · (cᵢ−cⱼ) / T ).
 * sign(vᵢ−vⱼ) is a CONSTANT read off the (fixed) data — it must never be on the tape (sign has zero
 * gradient a.e. and is undefined at 0). Tied data pairs (sign 0) contribute σ(0)=0.5 and stay in the
 * denominator, so the surrogate matches the exact "ties count 0.5" convention. → exact F_ord as T→0.
 */
export function fOrd(c: Value[], v: Value[], T: number): Value {
  const n = c.length;
  const terms: Value[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = Math.sign(v[i]!.data - v[j]!.data); // constant, off-tape
      const diff = div(sub(c[i]!, c[j]!), val(T));
      terms.push(sigmoid(mul(val(s), diff)));
    }
  }
  return mean(terms);
}

/** Interval rung: F_int = r²(c, v) (sqrt-free, ε-guarded). = 1 iff c = a·v + b, a≠0. */
export function fInt(c: Value[], v: Value[], eps: number): Value {
  return r2(c, v, eps);
}

/**
 * Ratio rung (requires c, v > 0): F_ratio = exp( −Var(log c − log v) / σ₀² ).
 * = 1 iff c = k·v (k>0); invariant to the figure's overall scale k (the constant log k drops out of
 * the variance). log repels degenerate zero-length segments.
 */
export function fRatio(c: Value[], v: Value[], sigma0Sq: number): Value {
  const d = c.map((ci, i) => sub(log(ci), log(v[i]!)));
  return exp(neg(div(variance(d), val(sigma0Sq))));
}

// ── exact display forms (plain numbers) ─────────────────────────────────────────

function signN(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function meanN(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return x.length ? s / x.length : 0;
}

function varianceN(x: ArrayLike<number>): number {
  const m = meanN(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - m;
    s += d * d;
  }
  return x.length ? s / x.length : 0;
}

/** Exact ordinal fidelity: (Kendall τ + 1)/2 = concordant-pair fraction, ties 0.5. */
export function fOrdExact(c: ArrayLike<number>, v: ArrayLike<number>): number {
  const n = c.length;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = signN(c[i]! - c[j]!) * signN(v[i]! - v[j]!);
      sum += a > 0 ? 1 : a < 0 ? 0 : 0.5;
      count++;
    }
  }
  return count ? sum / count : 1;
}

/** Exact interval fidelity: r² (no ε). 0 if either vector is constant. */
export function fIntExact(c: ArrayLike<number>, v: ArrayLike<number>): number {
  const mc = meanN(c);
  const mv = meanN(v);
  let cov = 0;
  let vc = 0;
  let vv = 0;
  for (let i = 0; i < c.length; i++) {
    const dc = c[i]! - mc;
    const dv = v[i]! - mv;
    cov += dc * dv;
    vc += dc * dc;
    vv += dv * dv;
  }
  if (vc === 0 || vv === 0) return 0;
  const r = cov / Math.sqrt(vc * vv);
  return r * r;
}

/** Exact ratio fidelity (requires c, v > 0). */
export function fRatioExact(c: ArrayLike<number>, v: ArrayLike<number>, sigma0Sq: number): number {
  const d = new Array<number>(c.length);
  for (let i = 0; i < c.length; i++) d[i] = Math.log(c[i]!) - Math.log(v[i]!);
  return Math.exp(-varianceN(d) / sigma0Sq);
}
