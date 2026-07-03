// src/core/score.test.ts — the v2 total score, in both scoring modes.
//
// The heart of this file is the AUDIT REGRESSION GATE: under the v1 objective the degenerate
// figures in fixtures.auditDegenerates BEAT the golden bar chart (confirmed illegible-optimum).
// The v2 score must rank the golden bars above every one of them, on total S, forever.

import { describe, it, expect } from 'vitest';
import { val, type Value } from './autograd/engine';
import { config, type Config } from '../config';
import { cloneFigure, segBase, seedToFigure, type Figure } from './figure';
import { pageFromConfig, frameFromConfig } from './frame';
import { scoreExact, scoreValue, type RelationBreakdown } from './score';
import { gradScore } from './gradient';
import { seedToDataSet } from './data';
import { REGISTRY, carriers, allCarriers } from './measurements/registry';
import { lseMeanN } from './fidelity/ladder';
import { ScaleType } from './scale';
import { frozenDof } from './penalties/frozenDof';
import { economy } from './penalties/economy';
import type { PenaltyContext } from './penalties/registry';
import {
  wellSeparatedData,
  goldenBarChart,
  auditDegenerates,
  valueScale,
  valueSortedBars,
} from './fixtures';
import { mulberry32, uniform } from './rng';

const data = wellSeparatedData();
const K = valueScale(data); // bars scaled into the ~100-unit page box (legible by construction)
const golden = goldenBarChart(data, { k: K, spacing: 10, x0: 5 });
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));
const fixed: Config = { ...config, scoring: 'fixed' };
const rel = (f: Figure, key: 'sales' | 'order', cfg = config): RelationBreakdown =>
  scoreExact(f, data, cfg).relations.find((r) => r.key === key)!;

describe('score v2: AUDIT REGRESSION GATE — golden bars beat every winning degenerate', () => {
  it('golden > value-sorted bars, nested ray, collinear pileup, value spiral, random (total S)', () => {
    for (const d of [data, seedToDataSet(1)]) {
      const g = scoreExact(goldenBarChart(d, { k: valueScale(d), spacing: 10, x0: 5 }), d).total;
      for (const { name, figure } of auditDegenerates(d)) {
        expect(g, `golden vs ${name} (seed ${d.seed})`).toBeGreaterThan(scoreExact(figure, d).total + 0.1);
      }
      for (const s of [7, 13, 42]) {
        expect(g, `golden vs random seed ${s}`).toBeGreaterThan(scoreExact(seedToFigure(s), d).total + 0.1);
      }
    }
  });
  it('the degenerates lose WHERE they should: their order relation collapses', () => {
    for (const { name, figure } of auditDegenerates(data)) {
      expect(rel(figure, 'order').aggregated, name).toBeLessThan(0.3);
    }
    expect(rel(golden, 'order').aggregated).toBeGreaterThan(0.6);
  });
});

describe('score v2 (comprehensive): distinct-carrier matrix', () => {
  it('BOTH relations scored vs all 16 distinct carriers (v2.2: ratio ≤ cyclic restored); counts come from carriers(cfg)', () => {
    const b = scoreExact(golden, data);
    expect(b.relations.find((r) => r.key === 'sales')!.carriers.length).toBe(16);
    expect(b.relations.find((r) => r.key === 'order')!.carriers.length).toBe(16);
    expect(b.distinctCarriers).toBe(carriers(config).length);
    expect(b.distinctCarriers).toBe(16);
    expect(b.censusSize).toBe(REGISTRY.size);
    expect(Number.isFinite(b.reward)).toBe(true);
  });

  it('breakdown rows carry the v2 fields: label, salience, q, aliases, signedTau, rungs', () => {
    const sales = rel(golden, 'sales');
    const len = sales.carriers.find((c) => c.id === 'page.displacement.magnitude')!;
    expect(len.label).toBe('length');
    expect(len.aliases).toContain('frame.displacement.magnitude');
    expect(len.salience).toBeGreaterThan(0.85);
    expect(len.q).toBeGreaterThan(0.7);
    expect(len.rungs.map((r) => r.name)).toEqual(['ord', 'int', 'ratio']);
    expect(len.signedTau).toBeGreaterThan(0.9); // lengths INCREASE with sales → ↑ direction
    // order carriers: x positions run ↑ with the labels
    const startX = rel(golden, 'order').carriers.find((c) => c.label === 'start x')!;
    expect(startX.signedTau).toBeCloseTo(1, 9);
    // a mirrored encoding shows ↓: bars at DECREASING x
    const mirrored = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      mirrored[b] = 120 - golden[b]!;
      mirrored[b + 2] = 120 - golden[b + 2]!;
    }
    const mStartX = scoreExact(mirrored, data).relations.find((r) => r.key === 'order')!
      .carriers.find((c) => c.label === 'start x')!;
    expect(mStartX.signedTau).toBeCloseTo(-1, 9);
    expect(mStartX.q).toBeGreaterThan(0.85); // and it still EARNS: reversed axes are legible
  });

  it('golden bars make MULTIPLE carriers track sales (length AND rise AND end y)', () => {
    const sales = rel(golden, 'sales');
    const tracking = sales.carriers.filter((c) => c.q >= 0.7);
    expect(tracking.length).toBeGreaterThanOrEqual(3);
    expect(sales.carriers[0]!.q).toBeGreaterThan(0.7);
  });

  it('is finite on random and degenerate figures (NaN-safety preserved)', () => {
    for (let s = 0; s < 12; s++) {
      const b = scoreExact(seedToFigure(s), data);
      expect(Number.isFinite(b.total)).toBe(true);
      for (const r of b.relations) for (const c of r.carriers) expect(Number.isFinite(c.q)).toBe(true);
    }
    const collapsed = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      collapsed[b + 2] = collapsed[b]!;
      collapsed[b + 3] = collapsed[b + 1]!;
    }
    expect(Number.isFinite(scoreExact(collapsed, data).total)).toBe(true);
    expect(Number.isFinite(scoreValue(leavesOf(collapsed), data).total.data)).toBe(true);
  });

  it('random figures score LOW quality (the v1 33%-chance floor is gone)', () => {
    for (const s of [3, 7, 11]) {
      expect(scoreExact(seedToFigure(s), data).quality).toBeLessThan(0.25);
    }
    expect(scoreExact(golden, data).quality).toBeGreaterThan(0.6);
  });
});

describe('score v2: carrier toggles (cfg.carriers.disabled) — the census shrinks EVERYWHERE at once', () => {
  const withOff = (disabled: string[], base: Config = config): Config => ({
    ...base,
    carriers: { disabled },
  });

  it('a disabled top carrier vanishes from the WHOLE breakdown and the LSE means renormalize (N shrinks)', () => {
    const base = scoreExact(golden, data);
    const off = scoreExact(golden, data, withOff(['page.displacement.magnitude'])); // 'length'
    // the disabled reading appears NOWHERE: not as a row id, not as an alias
    for (const r of off.relations) {
      for (const c of r.carriers) {
        expect(c.id).not.toBe('page.displacement.magnitude');
        expect(c.aliases).not.toContain('frame.displacement.magnitude');
      }
    }
    // counts shrink together: distinct census, sales candidates, order candidates
    expect(off.distinctCarriers).toBe(15);
    expect(off.relations.find((r) => r.key === 'sales')!.carriers.length).toBe(15);
    expect(off.relations.find((r) => r.key === 'order')!.carriers.length).toBe(15);
    // EXACT consistency: each relation's new LSE equals the LSE over the base qs minus the
    // disabled row — i.e. the mean's N really became N−1 (nothing hardcodes 12/16)
    for (const key of ['sales', 'order'] as const) {
      const baseQs = base.relations
        .find((r) => r.key === key)!
        .carriers.filter((c) => c.id !== 'page.displacement.magnitude')
        .map((c) => c.q);
      expect(off.relations.find((r) => r.key === key)!.aggregated).toBeCloseTo(
        lseMeanN(baseQs, config.aggregation.beta),
        9,
      );
    }
    // length is golden's best sales carrier: removing it must LOWER the sales relation
    expect(off.relations.find((r) => r.key === 'sales')!.aggregated).toBeLessThan(
      base.relations.find((r) => r.key === 'sales')!.aggregated,
    );
  });

  it('the data-ink mean renormalizes to the ACTIVE census (M shrinks with N)', () => {
    const off = scoreExact(
      golden,
      data,
      withOff(['page.displacement.magnitude', 'frame.midpoint.angle']),
    );
    // Reconstruct ink from the breakdown itself: mean_m s_m·(1 − smoothmax_R q_m(R)) over the 14
    // ACTIVE carriers (order is commensurable with every stamp, so its rows list all of them).
    const cells = new Map<string, { sal: number; qs: number[] }>();
    for (const r of off.relations) {
      for (const c of r.carriers) {
        const cell = cells.get(c.id) ?? { sal: c.salience, qs: [] };
        cell.qs.push(c.q);
        cells.set(c.id, cell);
      }
    }
    expect(cells.size).toBe(14);
    let ink = 0;
    for (const { sal, qs } of cells.values()) ink += sal * (1 - lseMeanN(qs, config.aggregation.beta));
    ink /= cells.size;
    expect(off.penalties.find((p) => p.name === 'spuriousness')!.value).toBeCloseTo(ink, 9);
  });

  it('EMPTY-relation guard: disabling ALL sales-commensurable carriers zeroes sales — no NaN, quality stays honest', () => {
    // v2.2: under the DEFAULT geometry sales is commensurable with every distinct carrier (ratio ∪
    // cyclic = all 16), so emptying sales would empty order too. A SHIFTED frame (origin ≠ 0)
    // unmerges the page point projections, which stay INTERVAL-stamped — order can read them,
    // sales cannot. Disabling every ratio+cyclic carrier there empties sales while order survives.
    const shifted: Config = { ...config, frame: { ...config.frame, origin: [10, 0] } };
    const salesIds = allCarriers(shifted)
      .filter((c) => c.stamp === ScaleType.Ratio || c.stamp === ScaleType.Cyclic)
      .map((c) => c.id);
    const cfg = withOff(salesIds, shifted);
    const b = scoreExact(golden, data, cfg);
    const sales = b.relations.find((r) => r.key === 'sales')!;
    expect(sales.carriers.length).toBe(0);
    expect(sales.aggregated).toBe(0); // lseMean over the empty set is 0 by definition
    expect(b.maxReward).toBe(2); // quality KEEPS the #relations denominator: value honestly can't encode
    expect(Number.isFinite(b.total)).toBe(true);
    expect(b.quality).toBeCloseTo(b.relations.find((r) => r.key === 'order')!.aggregated / 2, 12);
    // the differentiable path (the optimizer's objective) is finite and gradcheck-safe too
    expect(Number.isFinite(scoreValue(leavesOf(golden), data, cfg).total.data)).toBe(true);
    const gs = gradScore(golden, data, cfg);
    expect(Number.isFinite(gs.score)).toBe(true);
    for (const g of gs.grad) expect(Number.isFinite(g)).toBe(true);
  });

  it('disabling EVERYTHING: reward 0, ink 0, total 0 — and the gradient is finite (all zeros)', () => {
    const cfg = withOff(allCarriers(config).map((c) => c.id));
    const b = scoreExact(golden, data, cfg);
    expect(b.reward).toBe(0);
    expect(b.penalties.find((p) => p.name === 'spuriousness')!.value).toBe(0); // ink over ∅ = 0
    expect(b.total).toBe(0);
    expect(b.quality).toBe(0);
    expect(b.distinctCarriers).toBe(0);
    const gs = gradScore(seedToFigure(3), data, cfg);
    expect(Number.isFinite(gs.score)).toBe(true);
    for (const g of gs.grad) expect(g).toBe(0);
  });

  it('FIXED mode ignores disables of its configured carriers (the objective needs them to exist)', () => {
    const a = scoreExact(golden, data, fixed);
    const b = scoreExact(
      golden,
      data,
      withOff([config.fixedCarriers.sales, config.fixedCarriers.order], fixed),
    );
    expect(b.total).toBeCloseTo(a.total, 12);
    expect(b.reward).toBeCloseTo(a.reward, 12);
    expect(b.distinctCarriers).toBe(a.distinctCarriers);
    for (const key of ['sales', 'order'] as const) {
      expect(b.relations.find((r) => r.key === key)!.carriers.map((c) => c.id)).toEqual(
        a.relations.find((r) => r.key === key)!.carriers.map((c) => c.id),
      );
    }
    // a NON-fixed reading still toggles in fixed mode (the guard is per-carrier, not global):
    // the ink census M shrinks by one
    const c = scoreExact(golden, data, withOff(['frame.midpoint.angle'], fixed));
    expect(c.distinctCarriers).toBe(15);
  });
});

describe('score v2: LSE monotonicity (division of labor without losing "more matches wins")', () => {
  it('adding a matching carrier RAISES the relation: vertical bars > same-length random-angle bars', () => {
    // random-orientation bars: |displacement| = k·value (length matches) but rise/end-y do NOT
    const lengthOnly = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      const x = golden[b]!;
      const len = K * data.values[i]!;
      const theta = (i * 2.399963) % (2 * Math.PI);
      lengthOnly[b] = x;
      lengthOnly[b + 1] = 0;
      lengthOnly[b + 2] = x + len * Math.cos(theta);
      lengthOnly[b + 3] = len * Math.sin(theta);
    }
    expect(rel(golden, 'sales').aggregated).toBeGreaterThan(rel(lengthOnly, 'sales').aggregated + 1e-4);
  });
  it('one perfect+salient carrier beats many mediocre ones (value-sorted x helps sales less than losing order costs)', () => {
    // value-sorted bars give sales MANY partial carriers; golden gives sales a few PERFECT ones and
    // keeps order intact — golden must win on total (the audit's central failure, inverted).
    expect(scoreExact(golden, data).total).toBeGreaterThan(scoreExact(valueSortedBars(data), data).total);
  });
});

describe('score v2: salience gate (audit defect 3: resolution-free fidelity)', () => {
  const scaled = (k: number): Figure => {
    const f = cloneFigure(golden);
    for (let i = 0; i < f.length; i++) f[i] = golden[i]! * k;
    return f;
  };
  it('a sub-legible (sub-pixel) perfect figure earns ≈ 0 on every LENGTH-class carrier', () => {
    const b = scoreExact(scaled(0.001), data); // spans ~0.1 page units ≪ θ_len
    // BOTH relations keep only their angle-class residue (bearings are scale-free BY DESIGN — a
    // uniform shrink preserves angular structure; θ_ang gates angle spread, not figure size).
    // v2.2: sales includes the cyclic carriers now, so the invariant is stated PER LENGTH-CLASS
    // carrier, exactly as it always was for order — no length reading survives the shrink.
    for (const r of b.relations) {
      for (const c of r.carriers) {
        if (c.id.includes('angle')) continue;
        expect(c.q, `${r.key}:${c.id}`).toBeLessThan(0.02);
      }
    }
    // the surviving residue is honest scale-free structure: atan2(k·v, x) half-tracks sales
    // (fr·end angle q ≈ 0.48, measured) — bounded well below a legible figure's relation
    expect(b.relations.find((r) => r.key === 'sales')!.aggregated).toBeLessThan(0.3);
    expect(b.quality).toBeLessThan(0.2); // was < 0.1 pre-v2.2: the delta IS the angle residue
    expect(b.quality).toBeLessThan(scoreExact(golden, data).quality / 3); // and stays far below legible
  });
  it('growing the spread recovers the score monotonically (scale is NO LONGER a full symmetry)', () => {
    const rewards = [0.001, 0.01, 0.1, 1].map((k) => scoreExact(scaled(k), data).reward);
    for (let i = 1; i < rewards.length; i++) expect(rewards[i]!).toBeGreaterThan(rewards[i - 1]!);
  });
  it('ABOVE the reader resolution the score saturates (large figures score alike)', () => {
    const r5 = scoreExact(scaled(5), data).reward;
    const r10 = scoreExact(scaled(10), data).reward;
    expect(Math.abs(r10 - r5)).toBeLessThan(0.02);
  });
  it('in fixed mode a perfect-but-invisible carrier is also ≈ 0 (same ladder, same gate)', () => {
    expect(scoreExact(scaled(0.001), data, fixed).quality).toBeLessThan(0.05);
    expect(scoreExact(golden, data, fixed).quality).toBeGreaterThan(0.8);
  });
});

describe('score v2 (fixed mode): same ladder + salience on the single configured carriers', () => {
  it('golden scores high quality; one carrier per relation; aggregated = its own q (LSE of one)', () => {
    const b = scoreExact(golden, data, fixed);
    expect(b.quality).toBeGreaterThan(0.8);
    for (const r of b.relations) {
      expect(r.carriers.length).toBe(1);
      expect(r.aggregated).toBeCloseTo(r.carriers[0]!.q, 9);
    }
  });
});

describe('score v2: data-ink penalty (spuriousness, ON by default at 0.25)', () => {
  it('is wired with its weight and charged: random figures pay MORE ink than golden bars', () => {
    const g = scoreExact(golden, data);
    const r = scoreExact(seedToFigure(7), data);
    const gInk = g.penalties.find((p) => p.name === 'spuriousness')!;
    const rInk = r.penalties.find((p) => p.name === 'spuriousness')!;
    expect(gInk.weight).toBe(config.penalties.spuriousness);
    expect(gInk.weight).toBeGreaterThan(0);
    expect(rInk.weighted).toBeGreaterThan(gInk.weighted + 0.05); // loud meaningless variation costs
    expect(gInk.value).toBeGreaterThanOrEqual(0); // mean-LSE keeps every ink term ≥ 0
    // v2.2: total = reward + coincidence bonus − penalty (bonus shown separately from quality)
    expect(g.total).toBeCloseTo(g.reward + g.bonuses.coincidence - g.penalty, 9);
  });
  it('quiet unassigned DOF cost nothing: golden (constant baseline/tilt/run) pays little ink', () => {
    const gInk = scoreExact(golden, data).penalties.find((p) => p.name === 'spuriousness')!;
    expect(gInk.value).toBeLessThan(0.3);
  });
  it('value path and exact path agree on the penalty (within the ordinal-surrogate fork)', () => {
    const sv = scoreValue(leavesOf(golden), data);
    expect(Math.abs(sv.penalty.data - scoreExact(golden, data).penalty)).toBeLessThan(0.01);
  });
  it('FIXED mode: loud meaningless variation on UNASSIGNED DOF pays ink (audit defect 10, fixed mode)', () => {
    // Same encodings on the two configured carriers (start x preserved → order; length preserved →
    // sales) but randomized tilts and baselines: numerically perfect fixed-mode "bars" rendered as
    // pick-up-sticks. The data-ink mean runs over the FULL deduped carrier set M(cfg) even in fixed
    // mode, so the pick-up-sticks must pay strictly more spuriousness and score a lower total.
    const rng = mulberry32(31);
    const messy = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      const len = Math.hypot(golden[b + 2]! - golden[b]!, golden[b + 3]! - golden[b + 1]!);
      const baseY = uniform(rng, -40, 40);
      const th = uniform(rng, 0, 2 * Math.PI);
      messy[b + 1] = baseY; // random baseline (start x at b+0 untouched)
      messy[b + 2] = golden[b]! + len * Math.cos(th); // random tilt, length preserved
      messy[b + 3] = baseY + len * Math.sin(th);
    }
    const g = scoreExact(golden, data, fixed);
    const m = scoreExact(messy, data, fixed);
    const ink = (bd: typeof g): number => bd.penalties.find((p) => p.name === 'spuriousness')!.weighted;
    expect(m.reward).toBeCloseTo(g.reward, 9); // the two assigned carriers are IDENTICAL vectors
    expect(ink(m)).toBeGreaterThan(ink(g) + 0.02); // …but the fabricated structure is charged
    expect(m.total).toBeLessThan(g.total - 0.02);
    // the penalty saw the full deduped set, not just the 2 assigned carriers
    expect(g.distinctCarriers).toBe(16);
    // and the differentiable path agrees (the ink gradient exists on unassigned DOF in fixed mode)
    const sv = scoreValue(leavesOf(messy), data, fixed);
    expect(Math.abs(sv.penalty.data - m.penalty)).toBeLessThan(0.01);
  });
  it('frozenDof/economy remain registered at weight 0', () => {
    const b = scoreExact(golden, data);
    for (const name of ['frozenDof', 'economy'] as const) {
      const t = b.penalties.find((p) => p.name === name)!;
      expect(t.weight).toBe(0);
      expect(t.weighted).toBe(0);
    }
  });
});

describe('score v2: scoreValue ≈ scoreExact at small T (the only fork is the ordinal surrogate)', () => {
  it('golden + degenerates + random agree within tolerance', () => {
    const cfg: Config = { ...config, T: 0.002 };
    const figures: [string, Figure][] = [
      ['golden', golden],
      ...auditDegenerates(data).map(({ name, figure }) => [name, figure] as [string, Figure]),
      ['random', seedToFigure(5)],
    ];
    for (const [name, f] of figures) {
      const sv = scoreValue(leavesOf(f), data, cfg);
      const se = scoreExact(f, data, cfg);
      expect(Math.abs(sv.total.data - se.total), name).toBeLessThan(0.05);
      expect(Math.abs(sv.reward.data - se.reward), name).toBeLessThan(0.05);
    }
  });
});

describe('penalties: still compute sane values on hand-built contexts (cells optional)', () => {
  const penCtx: PenaltyContext = {
    map: new Map([
      ['sales', config.fixedCarriers.sales],
      ['order', config.fixedCarriers.order],
    ]),
    registry: REGISTRY,
    frame: frameFromConfig(),
    page: pageFromConfig(),
    data,
    cfg: config,
  };
  it('frozenDof ≥ 0 and ≈ 0 for the golden (shared baseline + vertical); economy = 2', () => {
    expect(frozenDof.valueExact(golden, penCtx)).toBeGreaterThanOrEqual(0);
    expect(frozenDof.valueExact(golden, penCtx)).toBeLessThan(1e-9);
    expect(economy.valueExact(golden, penCtx)).toBe(2);
  });
});
