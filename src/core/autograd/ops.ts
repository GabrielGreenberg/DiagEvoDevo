// src/core/autograd/ops.ts
//
// Derived vector reductions, composed entirely from the engine primitives so their gradients
// come for free. A 12-vector is a `Value[]`. These are the building blocks of the fidelity
// ladder and the penalties.
//
// Two subtleties the math-core design pass flagged, both encoded here:
//   • variance/covariance are built from a LIVE `Value` mean. Detaching the mean (treating it as
//     a constant) gives the right forward value but the WRONG gradient — the −μ cross-terms only
//     cancel because μ carries gradient. gradcheck on `variance` catches a detached mean.
//   • r² is built sqrt-free as cov²/((Var+ε)(Var+ε)); this keeps the sqrt' singularity off the
//     tape and, when the figure vector is constant (Var→0, cov→0), yields r²→0 (correct: a flat
//     figure has no interval structure) with a finite gradient.

import { Value, val, add, sub, mul, div, pow, log, sqrt, sin, cos, atan2 } from './engine';

/** Σ xs (empty ⇒ 0). */
export function sum(xs: Value[]): Value {
  if (xs.length === 0) return val(0);
  let acc = xs[0]!;
  for (let i = 1; i < xs.length; i++) acc = add(acc, xs[i]!);
  return acc;
}

/** Arithmetic mean. The returned Value is live — its gradient flows into every element. */
export function mean(xs: Value[]): Value {
  if (xs.length === 0) return val(0);
  return div(sum(xs), val(xs.length));
}

/** Population variance Σ(xᵢ−μ)²/n, centered form (no catastrophic cancellation). */
export function variance(xs: Value[]): Value {
  const mu = mean(xs);
  const sqDevs = xs.map((x) => pow(sub(x, mu), 2));
  return mean(sqDevs);
}

/** Population covariance Σ(aᵢ−ā)(bᵢ−b̄)/n. */
export function covariance(a: Value[], b: Value[]): Value {
  const ma = mean(a);
  const mb = mean(b);
  const prods = a.map((ai, i) => mul(sub(ai, ma), sub(b[i]!, mb)));
  return mean(prods);
}

/**
 * Squared Pearson correlation r², built sqrt-free: cov² / ((Var(a)+ε)(Var(b)+ε)).
 * = 1 iff b = a·x + c (a>0) up to ε. This is the interval-rung fidelity F_int.
 */
export function r2(a: Value[], b: Value[], eps: number): Value {
  const cov = covariance(a, b);
  const va = variance(a);
  const vb = variance(b);
  const denom = mul(add(va, val(eps)), add(vb, val(eps)));
  return div(mul(cov, cov), denom);
}

/**
 * logLength = ½·log(dx² + dy²). The differentiable segment length.
 * Deliberately NOT log(sqrt(dx²+dy²)): the ½·log(sq) form keeps its only singularity in the
 * `log` (value → −∞ as length → 0, which is the intended repulsion of degenerate segments) and
 * gives gradient dx/(dx²+dy²), dy/(dx²+dy²) — which blows up in the LENGTHENING direction near
 * zero length, exactly the desired push away from a collapsed segment. No sqrt' ever enters.
 */
export function logLength(dx: Value, dy: Value): Value {
  const sq = add(mul(dx, dx), mul(dy, dy));
  return mul(val(0.5), log(sq));
}

/** Euclidean length √(dx²+dy²). For display / ratio carriers; prefer logLength on the tape. */
export function length2(dx: Value, dy: Value): Value {
  return sqrt(add(mul(dx, dx), mul(dy, dy)));
}

/** Circular mean of angles: atan2(Σsin, Σcos). Wrap-aware, gradient flows through atan2. */
export function circularMean(thetas: Value[]): Value {
  const C = sum(thetas.map((t) => cos(t)));
  const S = sum(thetas.map((t) => sin(t)));
  return atan2(S, C);
}

/**
 * Circular variance 1 − R, where R = √(C²+S²)/n is the mean resultant length ∈ [0,1].
 * = 0 for a common orientation (all angles equal), = 1 for uniform/antipodal spread.
 * The εcircular guard keeps √ finite at C=S=0; the common-orientation zero is exactly reachable.
 */
export function circularVar(thetas: Value[], eps: number): Value {
  const n = thetas.length;
  if (n === 0) return val(0);
  const C = sum(thetas.map((t) => cos(t)));
  const S = sum(thetas.map((t) => sin(t)));
  const R = div(sqrt(add(add(mul(C, C), mul(S, S)), val(eps))), val(n));
  return sub(val(1), R);
}
