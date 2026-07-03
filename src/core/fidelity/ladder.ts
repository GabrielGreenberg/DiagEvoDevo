// src/core/fidelity/ladder.ts
//
// The fidelity ladder (CONCEPT.md §6, v2 after the scoring-v2 redesign): three nested rungs of
// increasing strictness comparing an assigned figure measurement c ∈ ℝ¹² to a data vector v ∈ ℝ¹².
// Each rung has a DIFFERENTIABLE form (the optimized path, over the Value type) and an EXACT display
// form (plain numbers, for the score panel).
//
// v2 changes (all audit-confirmed defects, see handoffs/2026-07-01-scoring-v2-design.md):
//   • ordinal fidelity is τ_sym = |2·F_ord − 1| — CHANCE-CORRECTED (0 at random/constant carriers,
//     the hidden 0.5 floor is gone) and DIRECTION-SYMMETRIC (a reversed axis is readable);
//   • F_ord's margin denominator T·spread(c) is FLOORED at a legibility scale, killing both the
//     1/spread gradient explosion on near-constant carriers and the sub-pixel-order loophole;
//   • F_ratio is SIGNED-SAFE: magnitude carries proportion, a coherent sign (either sign — mirrored
//     encodings are legible) is required, gradients are smooth across 0, and a degenerate (constant)
//     carrier earns NO free reward. The old positivity clamp is gone. v2.1 (review fix): the sign
//     test is normalized per entry by the v-IMPLIED magnitude κ·ŝ·vᵢ (not by κ·spread(c)) and by the
//     derived ceiling tanh(1/(2κ)), so F_ratio = 1 EXACTLY at c = ±k·v and proportionality is a
//     stationary point — the spread-relative test capped perfect carriers at ~0.68 on real data and
//     made a power-law warp the optimum (confirmed review blocker).
//
// v2.2 (ratio≤cyclic restore): ANGLE carriers get a genuinely CIRCULAR interval form, fIntCirc
// (Mardia circular–linear correlation — wrap- and rotation-invariant, see its doc block); the
// ratio rung reuses fRatio UNCHANGED (its magnitude √(c²+ε) is continuous across the ±π cut and
// its side-coherence factor has only a localized, bounded discontinuity — measured in the dial
// tests); the ordinal rung keeps the raw form (documented localized-cut limitation). The routing
// by unit class lives in rungs.ts.
//
// The one place the two forms genuinely differ in VALUE is the ordinal rung: display uses exact
// Kendall τ, the optimizer uses the logistic surrogate (they agree as T→0 for carriers spread above
// the legibility floor — BELOW the floor the surrogate deliberately reads order as ties). Everywhere
// else the two forms are the same formula (Value vs number), pinned by tests.

import { Value, val, add, sub, mul, div, neg, exp, log, sigmoid, sqrt, maxConst, sin, cos } from '../autograd/engine';
import { mean, variance, covariance, r2 } from '../autograd/ops';
import { meanN, varianceN } from '../statsN';

// ── shared smooth helpers (composed from gradchecked primitives) ────────────────

/** Smooth |x| = sqrt(x² + ε): differentiable at the fold, → |x| as ε→0. */
export function smoothAbs(x: Value, eps: number): Value {
  return sqrt(add(mul(x, x), val(eps)));
}

/** spread(c) = sqrt(Var(c) + ε) — the carrier's scale (ε keeps sqrt' finite on constants). */
export function spreadOf(c: Value[], eps: number): Value {
  return sqrt(add(variance(c), val(eps)));
}

/**
 * Smooth-max aggregation: LSE(q; β) = (1/β)·log(mean_i exp(β·qᵢ)).
 * Lies in [min q, max q] (mean-form: ≤ max, so 1−LSE ≥ 0 for q ∈ [0,1]); strictly increasing in
 * every qᵢ — one excellent entry dominates, yet every improvement still raises the value.
 */
export function lseMean(qs: Value[], beta: number): Value {
  if (qs.length === 0) return val(0);
  const m = mean(qs.map((q) => exp(mul(val(beta), q))));
  return div(log(m), val(beta));
}

/** Exact twin of lseMean (plain numbers). */
export function lseMeanN(qs: ArrayLike<number>, beta: number): number {
  const n = qs.length;
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp(beta * qs[i]!);
  return Math.log(s / n) / beta;
}

/**
 * Best-carrier-only smooth aggregation (config.aggregation.matchBonus = false): the softmax-
 * weighted mean q̄ = Σ qᵢ·e^(β·qᵢ) / Σ e^(β·qᵢ). Smooth, ∈ [min q, max q]; a single dominant
 * entry ⇒ q̄ ≈ max. NOT monotone in every entry (∂q̄/∂qⱼ = (wⱼ/W)·(1 + β·(qⱼ − q̄)) < 0 when
 * qⱼ < q̄ − 1/β): adding/improving a far-below-leader entry slightly DILUTES the aggregate —
 * the documented trade-off of best-only semantics (see the config comment). Composed from
 * gradchecked primitives only (exp/mul/add/div).
 */
export function softmaxMean(qs: Value[], beta: number): Value {
  if (qs.length === 0) return val(0);
  const ws = qs.map((q) => exp(mul(val(beta), q)));
  let num: Value = mul(qs[0]!, ws[0]!);
  let den: Value = ws[0]!;
  for (let i = 1; i < qs.length; i++) {
    num = add(num, mul(qs[i]!, ws[i]!));
    den = add(den, ws[i]!);
  }
  return div(num, den);
}

/** Exact twin of softmaxMean (plain numbers). */
export function softmaxMeanN(qs: ArrayLike<number>, beta: number): number {
  const n = qs.length;
  if (n === 0) return 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.exp(beta * qs[i]!);
    num += qs[i]! * w;
    den += w;
  }
  return num / den;
}

/**
 * Coincidence equality kernel (config.bonuses.coincidence): eq = exp(−mean_i (aᵢ−bᵢ)² / (2σ²)).
 * = 1 iff the two 12-vectors return the SAME number per item in shared units; a proportional-but-
 * differently-scaled pair (b = k·a, k ≠ 1) at page scale earns ≈ 0, with a smooth monotone
 * convergence gradient as k → 1. σ is ABSOLUTE per unit class (page units / radians) — shared-unit
 * equality is the point. Composed from gradchecked primitives only.
 */
export function eqGauss(a: Value[], b: Value[], sigma: number): Value {
  const sq = a.map((ai, i) => {
    const d = sub(ai, b[i]!);
    return mul(d, d);
  });
  return exp(neg(div(mean(sq), val(2 * sigma * sigma))));
}

/** Exact twin of eqGauss (plain numbers). */
export function eqGaussN(a: ArrayLike<number>, b: ArrayLike<number>, sigma: number): number {
  const n = a.length;
  if (n === 0) return 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.exp(-(s / n) / (2 * sigma * sigma));
}

// ── ordinal rung ─────────────────────────────────────────────────────────────────

/**
 * Ordinal surrogate (concordant-pair fraction):
 *   F_ord ≈ mean_{i<j} σ( sign(vᵢ−vⱼ) · (cᵢ−cⱼ) / (T · spread'(c)) ),
 *   spread'(c) = max( sqrt(Var(c)+ε), spreadFloor ).
 *
 * The margin is normalized by the carrier's spread so T is dimensionless (→ exact F_ord as T→0),
 * and the spread is FLOORED at the legibility scale `spreadFloor` (unit-appropriate: page units for
 * length-class carriers, radians for angle-class — threaded in by the rung layer). The floor bounds
 * the gradient (no 1e8 explosion on near-constant carriers) and makes sub-legible order ≈ ties
 * (F→0.5 ⇒ τ_sym→0). sign(vᵢ−vⱼ) is a CONSTANT read off the fixed data (never on the tape); tied
 * data pairs (sign 0) contribute σ(0)=0.5 and stay in the denominator.
 */
export function fOrd(c: Value[], v: Value[], T: number, spreadFloor: number, spreadEps = 1e-12): Value {
  const n = c.length;
  const denom = mul(val(T), maxConst(spreadOf(c, spreadEps), spreadFloor)); // T · spread'(c)
  const terms: Value[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = Math.sign(v[i]!.data - v[j]!.data); // constant, off-tape
      const diff = div(sub(c[i]!, c[j]!), denom);
      terms.push(sigmoid(mul(val(s), diff)));
    }
  }
  return mean(terms);
}

/**
 * τ_sym — THE ordinal rung's fidelity (v2): smooth |2·F_ord − 1|.
 * 0 at chance level (random order) and on constant carriers, 1 when sorted EITHER way
 * (direction-symmetric: legibility is decodability up to axis direction). `absEps` is the
 * smoothing of |·| (config.eps.absSmooth).
 */
export function tauSym(
  c: Value[],
  v: Value[],
  T: number,
  spreadFloor: number,
  absEps: number,
  spreadEps = 1e-12,
): Value {
  const F = fOrd(c, v, T, spreadFloor, spreadEps);
  return smoothAbs(sub(mul(val(2), F), val(1)), absEps);
}

// ── interval rung ────────────────────────────────────────────────────────────────

/** Interval rung: F_int = r²(c, v) (sqrt-free, ε-guarded). = 1 iff c = a·v + b, a≠0.
 *  Already direction-symmetric; its chance level 1/(n−1) ≈ 0.09 is accepted and documented. */
export function fInt(c: Value[], v: Value[], eps: number): Value {
  return r2(c, v, eps);
}

// ── circular interval rung (angle carriers; v2.2 ratio≤cyclic restore) ──────────

/**
 * F_int on ANGLE carriers: the circular–linear correlation (Mardia 1976) — the multiple R² of the
 * data v regressed on (cos θ, sin θ):
 *   R² = (r_vc² + r_vs² − 2·r_vc·r_vs·r_cs) / (1 − r_cs²),
 *     r_vc = corr(v, cos θ), r_vs = corr(v, sin θ), r_cs = corr(cos θ, sin θ),
 * computed SQRT-FREE (no corr' singularities on the tape) as
 *   R² = (a²·Vs + b²·Vc − 2·a·b·c) / ((Vv + ε) · (Vc·Vs − c² + ε)),
 *     a = cov(v, cos θ), b = cov(v, sin θ), c = cov(cos θ, sin θ), V· the variances.
 *
 * Why this is the SOUND circular interval form (each property is a v1 branch-cut defect killed):
 *   • WRAP-INVARIANT: θ enters only through cos/sin, so the ±π atan2 cut is invisible — no cliff
 *     (v1: linear r² on raw bearings collapsed 5.56 → 0.84 under a 0.002 rad rotation).
 *   • ROTATION-INVARIANT: θ → θ+φ is a rotation of the (cos θ, sin θ) pair, which preserves
 *     span{1, cos θ, sin θ} — correct for INTERVAL: a dial's zero is arbitrary.
 *   • DIRECTION-SYMMETRIC: θ → −θ negates sin only; the span (and hence R²) is unchanged —
 *     mirrored dials are legible (v1 scored them ≈ 0).
 *   • ∈ [0, 1]: the numerator is the quadratic form [a b]·[[Vs,−c],[−c,Vc]]·[a b]ᵀ of a PSD matrix
 *     (det = Vc·Vs − c² ≥ 0, the (cos,sin) covariance determinant), and multiple-R² ≤ 1 bounds it
 *     by Vv·(Vc·Vs − c²); the ε-guards only shrink the ratio.
 *   • DEGENERACY → 0 SMOOTHLY: near-constant θ has numerator O(δ⁴) against the ε-held denominator
 *     (δ = angle spread), so R² → 0 with finite gradients; rank-1 (cos,sin) configurations (all
 *     bearings on ≤ 2 points) have numerator EXACTLY 0, so the guard sends them to 0 too — a
 *     two-point "dial" cannot pin an affine decoding and earns nothing.
 *   • = 1 iff v is an EXACT affine function of (cos θ, sin θ). A perfect dial θ = a·v + b is the
 *     near-1 case: R² → r²(θ, v) = 1 as the arc shrinks (small-arc limit sin θ ≈ θ) and stays ≈ 1
 *     over realistic dial spans (measured: 0.9948 at a 2.5 rad span, 0.953 even at 4 rad WHERE THE
 *     ARC WRAPS and linear r² collapses to 0.05 — see ladder.test).
 * ε plays the same role as in r² (config.eps.corrVar): a constant carrier earns 0, not NaN.
 */
export function fIntCirc(theta: Value[], v: Value[], eps: number): Value {
  const cs = theta.map((t) => cos(t));
  const sn = theta.map((t) => sin(t));
  const a = covariance(v, cs);
  const b = covariance(v, sn);
  const c = covariance(cs, sn);
  const vv = variance(v);
  const vc = variance(cs);
  const vs = variance(sn);
  // numerator a²·Vs + b²·Vc − 2abc; denominator (Vv+ε)·(Vc·Vs − c² + ε)
  const num = sub(add(mul(mul(a, a), vs), mul(mul(b, b), vc)), mul(val(2), mul(mul(a, b), c)));
  const det = add(sub(mul(vc, vs), mul(c, c)), val(eps));
  return div(num, mul(add(vv, val(eps)), det));
}

/**
 * Exact twin of fIntCirc — with the SAME ε-guarded denominators as the Value path (ε threaded from
 * config by the rung layer, the fRatioExact pattern), NOT the bare-denominator fIntExact pattern.
 * Unlike r² (bounded ≤ 1 by Cauchy–Schwarz even in floats), the sqrt-free Mardia form is a
 * CANCELLATION magnet at rank-1: exactly-antipodal bearings — a mixed-direction horizontal figure,
 * atan2 ∈ {0, π}, sin π = 1.2e-16 — leave det as ±1e-32 float noise, and an unguarded num/(vv·det)
 * then returns garbage (measured 1.48 > 1 through scoreExact, inflating a tilt cell q 0.07 → 0.54;
 * adversarial verification 2026-07-03). The ε dominates any noise-scale det, sending rank-1
 * configurations to ~0 in LOCKSTEP with fIntCirc; clean degenerates still return exactly 0, and
 * healthy dials shift by O(ε/det) ≈ 1e-8 — invisible at display precision.
 */
export function fIntCircExact(theta: ArrayLike<number>, v: ArrayLike<number>, eps: number): number {
  const n = theta.length;
  if (n === 0) return 0;
  const cs = new Array<number>(n);
  const sn = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    cs[i] = Math.cos(theta[i]!);
    sn[i] = Math.sin(theta[i]!);
  }
  const mv = meanN(v);
  const mc = meanN(cs);
  const ms = meanN(sn);
  let a = 0, b = 0, c = 0, vv = 0, vc = 0, vs = 0;
  for (let i = 0; i < n; i++) {
    const dv = v[i]! - mv;
    const dc = cs[i]! - mc;
    const ds = sn[i]! - ms;
    a += dv * dc;
    b += dv * ds;
    c += dc * ds;
    vv += dv * dv;
    vc += dc * dc;
    vs += ds * ds;
  }
  const det = vc * vs - c * c; // ≥ 0 up to float error (covariance determinant)
  if (vv <= 0 || det <= 0) return 0; // constant v, constant θ, or clean rank-1: no affine dial
  const num = a * a * vs + b * b * vc - 2 * a * b * c;
  return num / ((vv + eps) * (det + eps)); // ε swallows noise-scale det (see doc block)
}

// ── ratio rung (v2 signed-safe) ─────────────────────────────────────────────────

/**
 * The coherence ceiling tanh(1/(2κ)) = |2σ(1/κ)−1|: the raw sign-coherence of a PERFECTLY
 * proportional carrier (every sign test sits at exactly ±1/κ). Dividing by it makes coh = 1 exactly
 * at c = ±k·v. It is DERIVED from κ, never tuned independently.
 * Validity: the raw coherence is maximal at the proportional configuration provided σ(1/κ) ≥ 1−1/(2n)
 * (n = 12 items ⇒ κ ≲ 0.32; default 0.2). Larger κ would let spread-out magnitude ratios beat the
 * ceiling — keep κ small (it is a SHARP sign test, not a magnitude tolerance).
 */
export function cohCeil(kappa: number): number {
  return Math.tanh(1 / (2 * kappa));
}

/**
 * Ratio rung v2.1 (replaces the positivity clamp entirely; coh re-anchored per the scoring-v2
 * review — the spread-relative sign test capped a PERFECT proportional carrier at a data-dependent
 * base·coh ≈ 0.68 and made a power-law warp the optimum):
 *   |c|ᵢ  = sqrt(cᵢ² + εmag)                        (smooth magnitude; log|c| finite at 0)
 *   dᵢ    = log|c|ᵢ − log vᵢ                         (per-entry log ratio; v > 0)
 *   base  = exp( −Var(d) / σ₀² )                     (magnitude carries proportion)
 *   ŝ     = exp( mean d )                            (the v-implied carrier scale: |c| ≈ ŝ·v)
 *   coh   = |2·mean_i σ( cᵢ / (κ·ŝ·vᵢ + εd) ) − 1| / tanh(1/(2κ))     (smooth |·|)
 *   F_ratio = base · coh
 *
 * base = 1 iff |c| = k·v (k>0), invariant to the figure's overall scale (log k drops out of Var).
 * Each entry's sign test is normalized by ITS OWN v-implied magnitude κ·ŝ·vᵢ — so a proportional
 * carrier is fully coherent no matter how small its smallest entry is relative to the spread, and
 * F_ratio = 1 exactly iff c = ±k·v (mirrored, all-negative encodings are legible). The proportional
 * carrier is a STATIONARY point of coh (∂coh/∂c = 0 there — the mean-log constraint makes the
 * ŝ-feedback cancel), so the optimizer no longer warps golden bars. Mixed signs ⇒ coh ≈ 0; a
 * degenerate all-zero carrier ⇒ coh ≈ 0 (σ(0)=½ each): no free reward. The per-entry denominator is
 * a healthy scale wherever the carrier is near-proportional, so the gradient stays smooth across 0.
 */
export function fRatio(
  c: Value[],
  v: Value[],
  sigma0Sq: number,
  kappa: number,
  magEps: number,
  sigDenomEps: number,
  absEps: number,
): Value {
  // base: log|c|ᵢ = ½·log(cᵢ²+ε) (sqrt-free on the tape; only singularity is the intended log one)
  const d = c.map((ci, i) => sub(mul(val(0.5), log(add(mul(ci, ci), val(magEps)))), log(v[i]!)));
  const base = exp(neg(div(variance(d), val(sigma0Sq))));
  // sign coherence, per-entry v-implied normalization: ŝ·vᵢ is what |cᵢ| SHOULD be
  const sHat = exp(mean(d));
  const meanSig = mean(
    c.map((ci, i) => sigmoid(div(ci, add(mul(val(kappa), mul(sHat, v[i]!)), val(sigDenomEps))))),
  );
  const coh = div(smoothAbs(sub(mul(val(2), meanSig), val(1)), absEps), val(cohCeil(kappa)));
  return mul(base, coh);
}

// ── exact display forms (plain numbers) ─────────────────────────────────────────

function signN(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/** Exact ordinal ORDER measure: (Kendall τ + 1)/2 = concordant-pair fraction, ties 0.5.
 *  Kept plain (no legibility floor): the exact path reports true order; sub-legibility is the
 *  salience gate's and the surrogate's job. Also feeds signedTau = 2·F−1 for direction display. */
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

/** Exact τ_sym = |2·F_ord − 1| = |Kendall τ| (plain fold — the smooth ε is a surrogate detail). */
export function tauSymExact(c: ArrayLike<number>, v: ArrayLike<number>): number {
  return Math.abs(2 * fOrdExact(c, v) - 1);
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

/** Exact ratio fidelity v2.1 — the same base·coh formula as fRatio, plain numbers (plain |·|). */
export function fRatioExact(
  c: ArrayLike<number>,
  v: ArrayLike<number>,
  sigma0Sq: number,
  kappa: number,
  magEps: number,
  sigDenomEps: number,
): number {
  const n = c.length;
  const d = new Array<number>(n);
  for (let i = 0; i < n; i++) d[i] = 0.5 * Math.log(c[i]! * c[i]! + magEps) - Math.log(v[i]!);
  const base = Math.exp(-varianceN(d) / sigma0Sq);
  const sHat = Math.exp(meanN(d));
  let meanSig = 0;
  for (let i = 0; i < n; i++) meanSig += 1 / (1 + Math.exp(-c[i]! / (kappa * sHat * v[i]! + sigDenomEps)));
  meanSig /= n || 1;
  const coh = Math.abs(2 * meanSig - 1) / cohCeil(kappa);
  return base * coh;
}
