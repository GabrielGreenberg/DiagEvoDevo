// src/core/statsN.ts
//
// Plain-number statistics (the display / exact-metric path), mirroring the differentiable ops in
// core/autograd/ops.ts. Used by the ladder's exact forms and the penalties' exact values.

export function meanN(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return x.length ? s / x.length : 0;
}

export function varianceN(x: ArrayLike<number>): number {
  const m = meanN(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - m;
    s += d * d;
  }
  return x.length ? s / x.length : 0;
}

/** Circular variance 1 − R, R = √(C²+S²)/n ∈ [0,1]. 0 for a common orientation. */
export function circularVarN(thetas: ArrayLike<number>, eps = 0): number {
  const n = thetas.length;
  if (n === 0) return 0;
  let C = 0;
  let S = 0;
  for (let i = 0; i < n; i++) {
    C += Math.cos(thetas[i]!);
    S += Math.sin(thetas[i]!);
  }
  const R = Math.sqrt(C * C + S * S + eps) / n;
  return 1 - R;
}
