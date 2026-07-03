// src/core/coincidence.test.ts — adversarial gate for the COINCIDENCE bonus (config.bonuses
// .coincidence) and the matchBonus aggregation switch (config.aggregation.matchBonus).
//
// The bonus rewards ARRANGED equality: the figure making two reading procedures return the same
// number in the same page units (equality = proportionality + shared zero + shared unit — the rung
// above ratio). Everything here tries to EARN the bonus dishonestly and must fail:
//   • proportional-but-different-scale pairs (c2 = 2·c1, mid-y vs rise) earn ≈ 0 eq — but the
//     convergence gradient exists (eq rises monotonically as scales/zeros converge);
//   • golden bars earn it via the NAMED end-y ≡ rise ≡ length triple; random figures earn ≈ 0;
//   • equal-but-meaningless carriers are q-gated to ≈ 0; equal-but-CONSTANT carriers are
//     salience-gated to 0 (salience lives inside q);
//   • angle pairs run on σ_eqAngle (radians), length pairs on σ_eqLen (page units);
//   • weight = 0 removes the term bit-exactly from BOTH paths and the tape;
//   • Value ≈ exact at small T; the full-score gradcheck holds with the bonus active;
//   • matchBonus = false: single perfect carrier ⇒ relation ≈ 1, a second perfect adds < 0.01,
//     and the documented mediocre-dilution trade-off is pinned honestly.

import { describe, it, expect } from 'vitest';
import { val, type Value } from './autograd/engine';
import { gradcheckBuild } from './autograd/gradcheck';
import { config, type Config, N_ITEMS } from '../config';
import { cloneFigure, segBase, seedToFigure, type Figure } from './figure';
import { scoreExact, scoreValue, type Breakdown } from './score';
import { gradScore } from './gradient';
import { carriers, carrierFor, allCarriers } from './measurements/registry';
import { ScaleType } from './scale';
import { eqGauss, eqGaussN, softmaxMean, softmaxMeanN, lseMeanN } from './fidelity/ladder';
import { wellSeparatedData, goldenBarChart, valueScale } from './fixtures';
import { mulberry32, uniform } from './rng';

const data = wellSeparatedData();
const K = valueScale(data);
const golden = goldenBarChart(data, { k: K, spacing: 10, x0: 5 });
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));
const V = (xs: number[]): Value[] => xs.map((x) => val(x));
const BETA = config.aggregation.beta;

// canonical distinct-carrier ids of the golden sales triple (registry dedup, v1 geometry)
const LENGTH = 'page.displacement.magnitude';
const RISE = 'page.displacement.projPerp';
const END_Y = 'frame.end.projPerp';

const coinOf = (b: Breakdown, key: 'sales' | 'order'): number =>
  b.bonuses.relationCoin.find((r) => r.key === key)!.value;
const hasPair = (b: Breakdown, key: string, id1: string, id2: string): boolean =>
  b.bonuses.pairs.some(
    (p) => p.key === key && ((p.a === id1 && p.b === id2) || (p.a === id2 && p.b === id1)),
  );
const pairOf = (b: Breakdown, key: string, id1: string, id2: string) =>
  b.bonuses.pairs.find(
    (p) => p.key === key && ((p.a === id1 && p.b === id2) || (p.a === id2 && p.b === id1)),
  );
const extract = (id: string, f: Figure): Float64Array =>
  carrierFor(id, carriers(config)).measurement.extract(f);
const withCoin = (over: Partial<Config['bonuses']['coincidence']>, base: Config = config): Config => ({
  ...base,
  bonuses: { coincidence: { ...base.bonuses.coincidence, ...over } },
});

// hand-built figures ---------------------------------------------------------------

/** Grounded vertical bars at label-ordered x with RANDOM heights: end-y ≡ rise ≡ length is a real
 *  achieved equality (loud, salient) but tracks NO data relation — the q-gate's adversary. */
function randomHeightBars(seed: number): Figure {
  const rng = mulberry32(seed);
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const x = 5 + i * 10;
    f[b] = x;
    f[b + 1] = 0;
    f[b + 2] = x;
    f[b + 3] = uniform(rng, 10, 100);
  }
  return f;
}

/** Grounded vertical bars of CONSTANT height: the triple is equal but has zero variance. */
function constantHeightBars(h = 50): Figure {
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const x = 5 + i * 10;
    f[b] = x;
    f[b + 1] = 0;
    f[b + 2] = x;
    f[b + 3] = h;
  }
  return f;
}

/** Segments near rays from the origin, bearings monotone in the label, displacement tilted 0.3 rad
 *  off the ray: the four angle carriers nearly coincide (radian-scale differences), lengths don't. */
function tiltedRays(): Figure {
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const th = 0.2 + 0.25 * i;
    const r = 30 + 5 * i;
    f[b] = r * Math.cos(th);
    f[b + 1] = r * Math.sin(th);
    f[b + 2] = f[b]! + 40 * Math.cos(th + 0.3);
    f[b + 3] = f[b + 1]! + 40 * Math.sin(th + 0.3);
  }
  return f;
}

// ── the eq kernel: equality, not proportionality ─────────────────────────────────

describe('coincidence: eq kernel (equality = proportionality + shared zero + shared unit)', () => {
  const sigma = config.bonuses.coincidence.sigmaEqLen;
  const c1 = Array.from(data.values, (v) => K * v); // page-scale vector (~1..100 units)

  it('identical vectors earn eq = 1 exactly; c2 = 2·c1 earns ≈ 0 (proportionality is NOT enough)', () => {
    expect(eqGaussN(c1, c1, sigma)).toBe(1);
    expect(eqGaussN(c1, c1.map((x) => 2 * x), sigma)).toBeLessThan(1e-10);
    // Value twin agrees bit-for-bit on both
    expect(eqGauss(V(c1), V(c1), sigma).data).toBe(1);
    expect(eqGauss(V(c1), V(c1.map((x) => 2 * x)), sigma).data).toBeLessThan(1e-10);
  });

  it('the scale-convergence gradient exists: eq rises STRICTLY monotonically as k2 → k1', () => {
    const eqAt = (t: number): number => eqGaussN(c1, c1.map((x) => t * x), sigma);
    const ts = [2, 1.75, 1.5, 1.25, 1.1, 1.0];
    for (let i = 1; i < ts.length; i++) {
      expect(eqAt(ts[i]!), `t=${ts[i]}`).toBeGreaterThan(eqAt(ts[i - 1]!));
    }
    expect(eqAt(1)).toBe(1);
  });

  it('gradcheck: eq is smooth in both vectors (∇_ad ≈ ∇_fd)', () => {
    // healthy mid-slope region: c2 = 1.3·c1 on a small-magnitude vector
    const a = Array.from({ length: 12 }, (_, i) => i + 1);
    const x = [...a, ...a.map((v) => 1.3 * v)];
    const rep = gradcheckBuild(
      (leaves) => eqGauss(leaves.slice(0, 12), leaves.slice(12), sigma),
      x,
      { h: config.gradcheck.epsFD, tol: config.gradcheck.tol },
    );
    expect(rep.relL2).toBeLessThan(config.gradcheck.tol);
  });

  it('SHARED ZERO is required: lifting golden off its baseline kills eq(rise, end-y) monotonically', () => {
    // rise = k·v always; end y = k·v + b — proportional with an offset zero. eq must fall with b
    // and recover smoothly as the baseline grounds (b → 0): the grounding gradient.
    const eqAt = (baseline: number): number => {
      const f = goldenBarChart(data, { k: K, spacing: 10, x0: 5, baseline });
      return eqGaussN(extract(RISE, f), extract(END_Y, f), sigma);
    };
    const bs = [40, 20, 10, 5, 2, 0];
    for (let i = 1; i < bs.length; i++) {
      expect(eqAt(bs[i]!), `baseline=${bs[i]}`).toBeGreaterThan(eqAt(bs[i - 1]!));
    }
    expect(eqAt(0)).toBe(1);
    expect(eqAt(40)).toBeLessThan(1e-10);
    // and the RELATION-level bonus follows the grounding (strict once eq is above float dust)
    const coinAt = (baseline: number): number =>
      coinOf(scoreExact(goldenBarChart(data, { k: K, spacing: 10, x0: 5, baseline }), data), 'sales');
    const grounded = [10, 5, 2, 0].map(coinAt);
    for (let i = 1; i < grounded.length; i++) expect(grounded[i]!).toBeGreaterThan(grounded[i - 1]!);
  });
});

// ── earning the bonus honestly (golden) vs not at all (random) ───────────────────

describe('coincidence: golden bars earn it via the NAMED end-y ≡ rise ≡ length triple', () => {
  const b = scoreExact(golden, data);

  it('total = reward + bonus − penalty; the bonus is material for golden', () => {
    expect(b.total).toBeCloseTo(b.reward + b.bonuses.coincidence - b.penalty, 12);
    expect(b.bonuses.coincidence).toBeGreaterThan(0.15);
    expect(coinOf(b, 'sales')).toBeGreaterThan(0.25);
    expect(coinOf(b, 'order')).toBeGreaterThan(0.3); // verticality: start-x ≡ end-x ≡ mid-x
    // quality stays reward/#relations — the bonus is NOT smuggled into it
    expect(b.quality).toBeCloseTo(b.reward / b.maxReward, 12);
  });

  it('all three pairs of the triple are in the breakdown, eq ≈ 1, sorted by contribution', () => {
    for (const [x, y] of [
      [END_Y, RISE],
      [END_Y, LENGTH],
      [RISE, LENGTH],
    ] as const) {
      const p = pairOf(b, 'sales', x, y);
      expect(p, `${x} ≡ ${y}`).toBeDefined();
      expect(p!.eq).toBeGreaterThan(0.999);
      expect(p!.contribution).toBeGreaterThan(0.5);
    }
    // display truncation contract: ≤ 4 pairs per relation, sorted best-first, all > 0.01
    for (const key of ['sales', 'order'] as const) {
      expect(b.bonuses.pairs.filter((p) => p.key === key).length).toBeLessThanOrEqual(4);
    }
    for (let i = 1; i < b.bonuses.pairs.length; i++) {
      expect(b.bonuses.pairs[i]!.contribution).toBeLessThanOrEqual(b.bonuses.pairs[i - 1]!.contribution);
    }
    for (const p of b.bonuses.pairs) expect(p.contribution).toBeGreaterThan(0.01);
  });

  it('proportional-but-half-scale mid-y (a HIGH-q sales carrier) forms NO pair with rise', () => {
    // mid y = k·v/2 tracks sales perfectly (ratio rung = 1) — correlational doubling, not
    // coincidence. It must earn the LSE mean, never the pair bonus.
    const midY = 'frame.midpoint.projPerp';
    const qMid = b.relations.find((r) => r.key === 'sales')!.carriers.find((c) => c.id === midY)!.q;
    expect(qMid).toBeGreaterThan(0.5); // genuinely tracking…
    expect(hasPair(b, 'sales', midY, RISE)).toBe(false); // …but not COINCIDENT
    expect(hasPair(b, 'sales', midY, END_Y)).toBe(false);
    expect(hasPair(b, 'sales', midY, LENGTH)).toBe(false);
  });

  it('random figures earn ≈ 0 bonus (nothing is arranged)', () => {
    for (const s of [3, 7, 11, 42]) {
      const rb = scoreExact(seedToFigure(s), data);
      expect(rb.bonuses.coincidence, `seed ${s}`).toBeLessThan(0.01);
      expect(rb.total).toBeCloseTo(rb.reward + rb.bonuses.coincidence - rb.penalty, 12);
    }
  });
});

// ── the gates: q (meaning) and salience (visibility) live INSIDE the pair score ──

describe('coincidence: gates — equality without meaning or visibility earns nothing', () => {
  it('equal-but-MEANINGLESS: random-height grounded bars have the eq = 1 triple, coin(sales) ≈ 0', () => {
    const f = randomHeightBars(9);
    // the equality is REAL (loud and salient)…
    expect(eqGaussN(extract(RISE, f), extract(END_Y, f), config.bonuses.coincidence.sigmaEqLen)).toBe(1);
    const b = scoreExact(f, data);
    // …but the heights track no relation, so the q-gate zeroes the pair
    expect(coinOf(b, 'sales')).toBeLessThan(0.01);
    expect(b.bonuses.pairs.some((p) => p.key === 'sales')).toBe(false);
    // the machinery itself is alive on the SAME figure: ordered x still earns order coincidence
    expect(coinOf(b, 'order')).toBeGreaterThan(0.3);
  });

  it('equal-but-CONSTANT: same-height bars are salience-gated to ≈ 0 (salience is inside q)', () => {
    const b = scoreExact(constantHeightBars(), data);
    const len = b.relations.find((r) => r.key === 'sales')!.carriers.find((c) => c.id === LENGTH)!;
    expect(len.salience).toBeLessThan(0.01); // constant carrier is invisible
    expect(coinOf(b, 'sales')).toBeLessThan(0.005);
    expect(b.bonuses.pairs.some((p) => p.key === 'sales')).toBe(false);
  });

  it('FIXED mode: one carrier per relation ⇒ no pairs ⇒ bonus exactly 0', () => {
    const b = scoreExact(golden, data, { ...config, scoring: 'fixed' });
    expect(b.bonuses.coincidence).toBe(0);
    for (const rc of b.bonuses.relationCoin) expect(rc.value).toBe(0);
    expect(b.bonuses.pairs).toEqual([]);
  });

  it('EMPTY relation (all ratio carriers disabled): relationCoin(sales) = 0, everything finite', () => {
    const ratioIds = allCarriers(config)
      .filter((c) => c.stamp === ScaleType.Ratio)
      .map((c) => c.id);
    const cfg: Config = { ...config, carriers: { disabled: ratioIds } };
    const b = scoreExact(golden, data, cfg);
    expect(coinOf(b, 'sales')).toBe(0);
    expect(Number.isFinite(b.bonuses.coincidence)).toBe(true);
    const gs = gradScore(golden, data, cfg);
    expect(Number.isFinite(gs.score)).toBe(true);
    for (const g of gs.grad) expect(Number.isFinite(g)).toBe(true);
  });
});

// ── unit classes: σ_eq is routed per unit class ──────────────────────────────────

describe('coincidence: σ_eq per unit class (page units for lengths, radians for angles)', () => {
  it('an ANGLE pair\'s recorded eq is exactly eqGauss(σ_eqAngle) on the extracted bearings', () => {
    const f = tiltedRays();
    const b = scoreExact(f, data);
    const p = pairOf(b, 'order', 'frame.end.angle', 'frame.midpoint.angle');
    expect(p).toBeDefined(); // radian-scale near-equality is listed under the default σ
    const expected = eqGaussN(
      extract('frame.end.angle', f),
      extract('frame.midpoint.angle', f),
      config.bonuses.coincidence.sigmaEqAngle,
    );
    expect(p!.eq).toBeCloseTo(expected, 12);
    // and it is NOT the length-σ value (radian differences under σ = 5 would read as eq ≈ 1)
    expect(p!.eq).toBeLessThan(0.95);
  });

  it('a LENGTH pair\'s recorded eq is exactly eqGauss(σ_eqLen) on the extracted vectors', () => {
    const f = goldenBarChart(data, { k: K, spacing: 10, x0: 5, baseline: 5 }); // offset zero: eq ≈ 0.6
    const b = scoreExact(f, data);
    const p = pairOf(b, 'sales', RISE, END_Y);
    expect(p).toBeDefined();
    const expected = eqGaussN(extract(RISE, f), extract(END_Y, f), config.bonuses.coincidence.sigmaEqLen);
    expect(p!.eq).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(Math.exp(-25 / (2 * 25)), 9); // exp(−b²/(2σ²)), b = σ = 5
    // under σ_eqAngle = 0.1 the same 5-unit offset would be eq ≈ e^(−1250) ≈ 0 — the routing matters
    expect(eqGaussN(extract(RISE, f), extract(END_Y, f), config.bonuses.coincidence.sigmaEqAngle)).toBeLessThan(1e-300);
  });

  it('widening σ_eqAngle raises ONLY the angle-pair relation; length relations are bit-identical', () => {
    const f = tiltedRays();
    const bNarrow = scoreExact(f, data);
    const bWide = scoreExact(f, data, withCoin({ sigmaEqAngle: 2.0 }));
    expect(coinOf(bWide, 'order')).toBeGreaterThan(coinOf(bNarrow, 'order') + 0.05);
    expect(coinOf(bWide, 'sales')).toBe(coinOf(bNarrow, 'sales')); // sales has no angle pairs
  });
});

// ── weight = 0: bit-exact removal from both paths and the tape ───────────────────

describe('coincidence: weight = 0 removes the term bit-exactly (both paths, and the tape)', () => {
  const cfg0 = withCoin({ weight: 0 });

  it('exact path: total === reward − penalty exactly; bonuses report the disabled shape', () => {
    for (const f of [golden, seedToFigure(7), tiltedRays()]) {
      const b = scoreExact(f, data, cfg0);
      expect(b.total === b.reward - b.penalty).toBe(true); // bit-exact, not toBeCloseTo
      expect(b.bonuses.coincidence).toBe(0);
      expect(b.bonuses.relationCoin).toEqual([]);
      expect(b.bonuses.pairs).toEqual([]);
    }
  });

  it('value path: the tape root stays sub(reward, penalty) and carries strictly fewer nodes', () => {
    const countNodes = (root: Value): number => {
      const seen = new Set<Value>();
      const stack = [root];
      while (stack.length > 0) {
        const n = stack.pop()!;
        if (seen.has(n)) continue;
        seen.add(n);
        for (const c of n._prev) stack.push(c);
      }
      return seen.size;
    };
    const sv0 = scoreValue(leavesOf(golden), data, cfg0);
    const sv1 = scoreValue(leavesOf(golden), data);
    expect(sv0.total._op).toBe('-'); // the bonus never touched the root
    expect(sv1.total._op).toBe('+');
    expect(sv0.total.data === sv0.reward.data - sv0.penalty.data).toBe(true);
    expect(sv0.bonus.data).toBe(0);
    expect(countNodes(sv0.total)).toBeLessThan(countNodes(sv1.total)); // no pair nodes built
    // and the exact twin agrees with the value twin at the disabled weight (ordinal-fork tolerance)
    expect(Math.abs(scoreExact(golden, data, cfg0).reward - sv0.reward.data)).toBeLessThan(0.05);
  });
});

// ── lockstep + gradcheck with the bonus ACTIVE ───────────────────────────────────

describe('coincidence: Value ≈ exact at small T, and the full-score gradcheck holds near golden', () => {
  it('bonus agrees across paths within the ordinal-surrogate fork (T = 0.002)', () => {
    const cfg: Config = { ...config, T: 0.002 };
    for (const [name, f] of [
      ['golden', golden],
      ['tilted rays', tiltedRays()],
      ['random', seedToFigure(5)],
    ] as [string, Figure][]) {
      const sv = scoreValue(leavesOf(f), data, cfg);
      const se = scoreExact(f, data, cfg);
      expect(Math.abs(sv.bonus.data - se.bonuses.coincidence), name).toBeLessThan(1e-3);
      expect(Math.abs(sv.total.data - se.total), name).toBeLessThan(0.05);
    }
  });

  it('gradcheck: full score with an ACTIVE bonus (jittered golden — eq ≈ 1 region) passes', () => {
    const rng = mulberry32(77);
    const f = cloneFigure(golden);
    for (let i = 0; i < f.length; i++) f[i] = f[i]! + uniform(rng, -0.5, 0.5);
    const rep = gradcheckBuild(
      (leaves) => scoreValue(leaves, data).total,
      Array.from(f),
      { h: config.gradcheck.epsFD, tol: 1e-5 },
    );
    expect(rep.relL2).toBeLessThan(1e-5);
  });
});

// ── matchBonus = false: best-carrier-only aggregation ────────────────────────────

describe('coincidence/aggregation: matchBonus = false (best-carrier-only softmax mean)', () => {
  const cfgNB: Config = { ...config, aggregation: { ...config.aggregation, matchBonus: false } };

  it('a single perfect salient carrier ⇒ relation ≈ 1; a second perfect one adds < 0.01', () => {
    const one = softmaxMeanN([1, 0.3, 0.2, 0.1, 0, 0, 0, 0], BETA);
    const two = softmaxMeanN([1, 1, 0.3, 0.2, 0.1, 0, 0, 0, 0], BETA);
    expect(one).toBeGreaterThan(0.99);
    expect(two - one).toBeGreaterThan(0); // still weakly increasing here…
    expect(two - one).toBeLessThan(0.01); // …but NOT materially (doubling is not credited)
    // contrast with the default LSE: the same second perfect carrier adds materially there
    expect(lseMeanN([1, 1, 0.3, 0.2, 0.1, 0, 0, 0, 0], BETA) - lseMeanN([1, 0.3, 0.2, 0.1, 0, 0, 0, 0], BETA))
      .toBeGreaterThan(0.05);
  });

  it('documented trade-off: a mediocre extra carrier DILUTES (the form is not monotone)', () => {
    const alone = softmaxMeanN([1], BETA);
    const diluted = softmaxMeanN([1, 0.2], BETA);
    expect(alone).toBe(1);
    expect(diluted).toBeLessThan(alone); // honest: this is the price of best-only semantics
    expect(alone - diluted).toBeLessThan(0.01); // …and it is small at β = 8
  });

  it('Value and exact twins agree; empty set is 0', () => {
    const qs = [0.9, 0.4, 0.1, 0];
    expect(softmaxMean(V(qs), BETA).data).toBeCloseTo(softmaxMeanN(qs, BETA), 12);
    expect(softmaxMeanN([], BETA)).toBe(0);
    expect(softmaxMean([], BETA).data).toBe(0);
  });

  it('integration: golden relations sit just under their best cell (≤ max q, ≥ max q − 0.05)', () => {
    const b = scoreExact(golden, data, cfgNB);
    for (const r of b.relations) {
      const maxQ = Math.max(...r.carriers.map((c) => c.q));
      expect(r.aggregated).toBeLessThanOrEqual(maxQ + 1e-12);
      expect(r.aggregated).toBeGreaterThan(maxQ - 0.05);
    }
    // the coincidence bonus is UNCHANGED by the switch (pair aggregation stays mean-LSE)
    expect(b.bonuses.coincidence).toBeCloseTo(scoreExact(golden, data).bonuses.coincidence, 12);
  });

  it('lockstep + gradcheck under matchBonus = false', () => {
    const cfgT: Config = { ...cfgNB, T: 0.002 };
    for (const f of [golden, seedToFigure(5)]) {
      const sv = scoreValue(leavesOf(f), data, cfgT);
      const se = scoreExact(f, data, cfgT);
      expect(Math.abs(sv.total.data - se.total)).toBeLessThan(0.05);
    }
    const rep = gradcheckBuild(
      (leaves) => scoreValue(leaves, data, cfgNB).total,
      Array.from(seedToFigure(21)),
      { h: config.gradcheck.epsFD, tol: 1e-5 },
    );
    expect(rep.relL2).toBeLessThan(1e-5);
  });
});
