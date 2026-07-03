// src/core/dial.test.ts — adversarial gate for the v2.2 ratio≤cyclic restore at the SCORE level.
//
// A dial/gauge (bearings ∝ value from a common center) is a legitimate encoding and must EARN:
// the tilt carrier's sales cell reaches the full ladder (ratio rung = 1, fIntCirc ≈ 1), mirrored
// dials score identically, rotation keeps the interval rung while honestly degrading ratio (a
// gauge's zero matters). And the v1 catastrophes must stay dead: the ±π wrap moves a cell by a
// BOUNDED, derived amount (v1: a 0.002 rad rotation collapsed a relation reward 5.56 → 0.84);
// the value-spiral's whispered angles stay salience-gated; random bearings earn chance-level
// fIntCirc; both scoring paths stay in lockstep and the full-score gradcheck holds with angle
// cells live in the sales relation.

import { describe, it, expect } from 'vitest';
import { val, type Value } from './autograd/engine';
import { gradcheckBuild } from './autograd/gradcheck';
import { config, type Config } from '../config';
import { cloneFigure, seedToFigure, type Figure } from './figure';
import { scoreExact, scoreValue, type Breakdown, type CarrierScore } from './score';
import { rewardExact, thetaFor } from './fidelity/rungs';
import { fIntCircExact, eqGaussN, cohCeil } from './fidelity/ladder';
import { ScaleType } from './scale';
import { carriers, carrierFor } from './measurements/registry';
import { varianceN } from './statsN';
import { wellSeparatedData, dialChart, valueSpiral, loudGoldenBarChart } from './fixtures';
import { mulberry32, uniform } from './rng';

const data = wellSeparatedData();
const vmax = Math.max(...Array.from(data.values));
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));
const TILT = 'page.displacement.angle'; // the canonical tilt carrier (page ≡ frame under v1 geometry)

const salesRow = (b: Breakdown, id: string): CarrierScore =>
  b.relations.find((r) => r.key === 'sales')!.carriers.find((c) => c.id === id)!;
const rung = (row: CarrierScore, name: 'ord' | 'int' | 'ratio'): number =>
  row.rungs.find((r) => r.name === name)!.f;
const extract = (id: string, f: Figure): Float64Array =>
  carrierFor(id, carriers(config)).measurement.extract(f);

describe('dial: a perfect gauge earns the full sales ladder through its ANGLE carrier', () => {
  const b = scoreExact(dialChart(data), data);
  const tilt = salesRow(b, TILT);

  it('sales is scored against the tilt carrier at all three rungs (the lattice edge is live)', () => {
    expect(b.relations.find((r) => r.key === 'sales')!.carriers.length).toBe(16); // nothing blocked
    expect(tilt.stamp).toBe(ScaleType.Cyclic);
    expect(tilt.rungs.map((r) => r.name)).toEqual(['ord', 'int', 'ratio']); // full ladder, not ord-only
  });

  it('ratio rung = 1 (|θ| ∝ v, coherent side) AND fIntCirc ≈ 1 (measured 0.9948 at 2.5 rad span)', () => {
    expect(rung(tilt, 'ratio')).toBeGreaterThan(0.999);
    expect(rung(tilt, 'int')).toBeGreaterThan(0.99);
    expect(rung(tilt, 'ord')).toBeGreaterThan(0.999); // bearings sorted like v (no wrap at span 2.5)
    // the int rung really is the circular form on the extracted bearings
    expect(rung(tilt, 'int')).toBeCloseTo(
      fIntCircExact(extract(TILT, dialChart(data)), data.values, config.eps.corrVar),
      12,
    );
  });

  it('the cell is salient and earns: q ≈ salience (rungs ≈ 1); salience uses θ_ang (radians)', () => {
    expect(tilt.salience).toBeGreaterThan(0.8);
    expect(tilt.q).toBeGreaterThan(0.8);
    // salience routing verified, not assumed: Var(θ)/(Var(θ)+θ_ang²) on the raw bearings
    const th = Array.from(extract(TILT, dialChart(data)));
    const theta = thetaFor('angle', config);
    expect(theta).toBe(config.salience.thetaAngle);
    expect(tilt.salience).toBeCloseTo(varianceN(th) / (varianceN(th) + theta * theta), 12);
  });

  it('MIRRORED dial (−k) scores identically on every rung (a reversed gauge is legible)', () => {
    const m = salesRow(scoreExact(dialChart(data, { k: -2.5 / vmax }), data), TILT);
    for (const name of ['ord', 'int', 'ratio'] as const) {
      expect(rung(m, name), name).toBeCloseTo(rung(tilt, name), 6);
    }
    expect(m.q).toBeCloseTo(tilt.q, 6);
  });

  it('ROTATED dial (+φ): fIntCirc UNCHANGED (a dial\'s zero is arbitrary — interval), ratio honestly degrades', () => {
    const r = salesRow(scoreExact(dialChart(data, { phase: 0.7 }), data), TILT);
    expect(rung(r, 'int')).toBeCloseTo(rung(tilt, 'int'), 9); // rotation invariance, exact
    expect(rung(r, 'ratio')).toBeLessThan(rung(tilt, 'ratio') - 0.3); // a gauge's zero matters (0.50 measured)
    // further rotation degrades ratio further while int still holds
    const r2 = salesRow(scoreExact(dialChart(data, { phase: 1.5 }), data), TILT);
    expect(rung(r2, 'int')).toBeCloseTo(rung(tilt, 'int'), 9);
    expect(rung(r2, 'ratio')).toBeLessThan(rung(r, 'ratio'));
  });
});

describe('dial: the ±π wrap is a BOUNDED localized step, not the v1 cliff (5.56 → 0.84)', () => {
  // One needle crossing |θ| = π flips (a) its SIDE in fRatio's coherence — bounded by one item's
  // share (2/n)/tanh(1/2κ) — and (b) its raw-bearing RANK in the ordinal rung — bounded by its
  // 11 pairs: 2·11/66. fIntCirc is wrap-invariant: its step is O(δ), not O(1). The DERIVED bound:
  //   Δcell ≤ w_ratio·(2/12)/cohCeil(κ) + w_ord·(2·11/66) + O(δ)
  //         = 4·0.1689… + 1·0.3333… ≈ 1.009 of a 7.5-max cell.
  // v1's linear r² on raw bearings collapsed the whole RELATION by 4.72 from a 0.002 rad step.
  const dlt = 0.001;
  const k = (Math.PI - dlt) / vmax; // the max-value needle sits at π − δ
  const before = Array.from(data.values, (x) => k * x);
  const after = before.map((t, i) => (data.values[i]! === vmax ? -(Math.PI - dlt) : t)); // crossed

  it('cell reward moves by ≤ the derived bound (measured Δ = 1.000 of max 7.5; fIntCirc step < 1e-3)', () => {
    const rb = rewardExact(Float64Array.from(before), data.values, ScaleType.Ratio, config, 'angle');
    const ra = rewardExact(Float64Array.from(after), data.values, ScaleType.Ratio, config, 'angle');
    const delta = Math.abs(rb.total - ra.total);
    const bound =
      config.weights.w_ratio * ((2 / 12) / cohCeil(config.ratioSign.kappa)) +
      config.weights.w_ord * ((2 * 11) / 66) +
      0.01; // the O(δ) residue of the wrap-invariant int rung
    console.log(
      `[anti-cliff] wrap-crossing Δcell = ${delta.toFixed(4)} (bound ${bound.toFixed(4)}, cell max 7.5) — v1 cliff was Δ4.72 on the whole relation`,
    );
    expect(delta).toBeLessThan(bound);
    const dInt = Math.abs(rb.rungs.find((r) => r.name === 'int')!.f - ra.rungs.find((r) => r.name === 'int')!.f);
    expect(dInt).toBeLessThan(1e-3); // the circular interval rung reads THROUGH the cut
  });

  it('whole-figure: rotating one needle across ±π moves the TOTAL score by < 0.1 (measured 0.073)', () => {
    const figBefore = dialChart(data, { k });
    const figAfter = cloneFigure(figBefore);
    const iMax = Array.from(data.values).indexOf(vmax);
    figAfter[iMax * 4 + 2] = 50 + 40 * Math.cos(-(Math.PI - dlt));
    figAfter[iMax * 4 + 3] = 50 + 40 * Math.sin(-(Math.PI - dlt));
    const sb = scoreExact(figBefore, data);
    const sa = scoreExact(figAfter, data);
    const delta = Math.abs(sb.total - sa.total);
    console.log(`[anti-cliff] wrap-crossing Δtotal = ${delta.toFixed(4)} — v1: 5.56 → 0.84 (Δ4.72)`);
    expect(delta).toBeLessThan(0.1);
  });
});

describe('dial: honesty gates — whispered angles, chance bearings, degenerate figures', () => {
  it('value spiral STILL scores ≈ 0 sales-from-angle: its 0.22 rad whisper is salience-gated', () => {
    const b = scoreExact(valueSpiral(data), data);
    for (const c of b.relations.find((r) => r.key === 'sales')!.carriers) {
      if (!c.id.includes('angle')) continue;
      expect(c.salience, c.id).toBeLessThan(0.05); // Var(θ) ≈ 0.0048 ≪ θ_ang² = 0.1225
      expect(c.q, c.id).toBeLessThan(0.05);
    }
    // and the audit gate holds WITH the restored edges: golden still crushes the spiral
    expect(scoreExact(loudGoldenBarChart(data), data).total).toBeGreaterThan(b.total + 0.5);
  });

  it('random figures: tilt-vs-sales fIntCirc sits at the two-regressor chance floor, never near 1', () => {
    let acc = 0;
    const N = 30;
    for (let s = 0; s < N; s++) {
      const th = extract(TILT, seedToFigure(s + 300));
      const f = fIntCircExact(th, data.values, config.eps.corrVar);
      expect(f, `seed ${s + 300}`).toBeLessThan(0.85);
      acc += f;
    }
    expect(acc / N).toBeLessThan(0.35); // chance ≈ 2/(n−1) = 0.18
  });

  it('degeneracy: collapsed segments (bearing of a zero vector) stay finite on both paths', () => {
    const collapsed = new Float64Array(48); // every segment collapsed at the origin
    const b = scoreExact(collapsed, data);
    expect(Number.isFinite(b.total)).toBe(true);
    for (const r of b.relations) for (const c of r.carriers) expect(Number.isFinite(c.q)).toBe(true);
    const sv = scoreValue(leavesOf(collapsed), data);
    expect(Number.isFinite(sv.total.data)).toBe(true);
  });
});

describe('dial: coincidence — an origin-centered dial ACHIEVES the angle identity and earns it', () => {
  // Needles from the FRAME ORIGIN make tilt ≡ fr·end angle ≡ fr·mid angle extensionally equal —
  // not merged (the dedup merges only definitional equality), so this is arranged coincidence.
  const odial = dialChart(data, { center: [0, 0] });
  const b = scoreExact(odial, data);
  const pairOf = (id1: string, id2: string) =>
    b.bonuses.pairs.find(
      (p) => p.key === 'sales' && ((p.a === id1 && p.b === id2) || (p.a === id2 && p.b === id1)),
    );

  it('sales earns ANGLE-pair coincidence (eq = 1 through σ_eqAngle), verified against eqGaussN', () => {
    const p = pairOf(TILT, 'frame.end.angle');
    expect(p).toBeDefined();
    expect(p!.eq).toBeGreaterThan(0.999);
    // the recorded eq is EXACTLY the angle-σ kernel on the extracted bearings — routing verified
    const expected = eqGaussN(
      extract(TILT, odial),
      extract('frame.end.angle', odial),
      config.bonuses.coincidence.sigmaEqAngle,
    );
    expect(p!.eq).toBeCloseTo(expected, 12);
    expect(b.bonuses.relationCoin.find((r) => r.key === 'sales')!.value).toBeGreaterThan(0.1);
  });

  it('the off-center dial does NOT get those pairs free (the identity must be arranged)', () => {
    const b2 = scoreExact(dialChart(data), data); // center (50,50): fr point angles ≠ tilt
    const p = b2.bonuses.pairs.find(
      (p2) => p2.key === 'sales' && [p2.a, p2.b].includes(TILT) && [p2.a, p2.b].includes('frame.end.angle'),
    );
    expect(p).toBeUndefined();
  });
});

describe('dial: Value ≈ exact lockstep and full-score gradcheck with live angle cells', () => {
  it('scoreValue ≈ scoreExact at small T on dial variants (only the ordinal-surrogate fork)', () => {
    const cfg: Config = { ...config, T: 0.002 };
    for (const [name, f] of [
      ['dial', dialChart(data)],
      ['origin dial', dialChart(data, { center: [0, 0] })],
      ['rotated dial', dialChart(data, { phase: 2.0 })],
      ['mirrored dial', dialChart(data, { k: -2.5 / vmax })],
    ] as [string, Figure][]) {
      const sv = scoreValue(leavesOf(f), data, cfg);
      const se = scoreExact(f, data, cfg);
      expect(Math.abs(sv.total.data - se.total), name).toBeLessThan(0.05);
      expect(Math.abs(sv.reward.data - se.reward), name).toBeLessThan(0.05);
    }
  });

  it('gradcheck: full score on a jittered dial (angle cells ACTIVE in sales) matches FD', () => {
    const rng = mulberry32(99);
    const f = cloneFigure(dialChart(data));
    for (let i = 0; i < f.length; i++) f[i] = f[i]! + uniform(rng, -0.5, 0.5);
    const rep = gradcheckBuild(
      (leaves) => scoreValue(leaves, data).total,
      Array.from(f),
      { h: config.gradcheck.epsFD, tol: 1e-5 },
    );
    expect(rep.relL2).toBeLessThan(1e-5);
  });
});
