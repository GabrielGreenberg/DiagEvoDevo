// src/core/score.test.ts — the total score, in both scoring modes.

import { describe, it, expect } from 'vitest';
import { val, type Value } from './autograd/engine';
import { config, type Config } from '../config';
import { cloneFigure, segBase, seedToFigure, type Figure } from './figure';
import { pageFromConfig, frameFromConfig } from './frame';
import { scoreExact, scoreValue, type RelationBreakdown } from './score';
import { REGISTRY } from './measurements/registry';
import { frozenDof } from './penalties/frozenDof';
import { economy } from './penalties/economy';
import type { PenaltyContext } from './penalties/registry';
import { wellSeparatedData, goldenBarChart } from './fixtures';

const data = wellSeparatedData();
const golden = goldenBarChart(data);
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));
const fixed: Config = { ...config, scoring: 'fixed' };
const salesRel = (f: Figure, cfg = config): RelationBreakdown =>
  scoreExact(f, data, cfg).relations.find((r) => r.key === 'sales')!;

describe('score (fixed mode): golden bar chart scores the single-carrier max', () => {
  it('quality = 1 (both relations fully satisfied); one measurement per relation', () => {
    const b = scoreExact(golden, data, fixed);
    expect(b.quality).toBeCloseTo(1, 6); // normalized: sales 7/7 + order 1/1 = 2 of 2
    expect(b.reward).toBeCloseTo(2, 6);
    for (const rel of b.relations) {
      expect(rel.measurements.length).toBe(1);
      expect(rel.normalized).toBeCloseTo(1, 6);
    }
  });
});

describe('score (comprehensive): the full matrix', () => {
  it('sales scored vs 20 measurements (ratio+cyclic), order vs 26; nothing is NaN', () => {
    const b = scoreExact(golden, data);
    expect(b.relations.find((r) => r.key === 'sales')!.measurements.length).toBe(20);
    expect(b.relations.find((r) => r.key === 'order')!.measurements.length).toBe(26);
    expect(Number.isFinite(b.reward)).toBe(true);
    for (const rel of b.relations) for (const m of rel.measurements) expect(Number.isFinite(m.reward)).toBe(true);
  });

  it('golden bars make MULTIPLE ratio measurements track sales (length AND rise AND height)', () => {
    const sales = salesRel(golden);
    const maxRung = sales.maxReward / sales.measurements.length; // 7
    const tracking = sales.measurements.filter((m) => m.reward / maxRung >= 0.9);
    expect(tracking.length).toBeGreaterThanOrEqual(2); // a rich homomorphism, not just one carrier
    expect(sales.measurements.some((m) => m.id === 'page.displacement.magnitude' && m.reward / maxRung >= 0.9)).toBe(true);
  });

  it('is finite on random and degenerate figures (posEps + length floors)', () => {
    for (let s = 0; s < 12; s++) expect(Number.isFinite(scoreExact(seedToFigure(s), data).reward)).toBe(true);
    const collapsed = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      collapsed[b + 2] = collapsed[b]!;
      collapsed[b + 3] = collapsed[b + 1]!;
    }
    expect(Number.isFinite(scoreExact(collapsed, data).reward)).toBe(true);
    expect(Number.isFinite(scoreValue(leavesOf(collapsed), data).reward.data)).toBe(true);
  });
});

describe('score (comprehensive): capturing MORE structure scores strictly higher', () => {
  it('vertical bars (length+rise+height match sales) beat same-length bars at random angles', () => {
    // random-orientation bars: |displacement| = value (length matches) but rise/projections do NOT
    const lengthOnly = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      const x = golden[b]!;
      const len = data.values[i]!;
      const theta = (i * 2.399963) % (2 * Math.PI); // deterministic pseudo-random angles
      lengthOnly[b] = x;
      lengthOnly[b + 1] = 0;
      lengthOnly[b + 2] = x + len * Math.cos(theta);
      lengthOnly[b + 3] = len * Math.sin(theta);
    }
    // both have length ∝ value, but golden also has rise/height ∝ value → more of the matrix satisfied
    expect(salesRel(golden).reward).toBeGreaterThan(salesRel(lengthOnly).reward + 1e-6);
  });
});

describe('score (comprehensive): scale invariance (translation is NOT a symmetry — the frame anchors it)', () => {
  it('scaling ALL coordinates about the frame origin leaves the reward unchanged', () => {
    const base = scoreExact(golden, data).reward;
    for (const k of [5, 0.2]) {
      const scaled = cloneFigure(golden);
      for (let i = 0; i < scaled.length; i++) scaled[i] = golden[i]! * k;
      expect(scoreExact(scaled, data).reward, `k=${k}`).toBeCloseTo(base, 5);
    }
  });
});

describe('score: penalties are wired but zero-weighted (no effect on the total)', () => {
  it('penalty = 0 at default weights; total = reward in both modes', () => {
    for (const cfg of [config, fixed]) {
      const b = scoreExact(golden, data, cfg);
      expect(b.penalty).toBe(0);
      expect(b.total).toBeCloseTo(b.reward, 9);
      for (const p of b.penalties) expect(p.weight).toBe(0);
    }
    expect(scoreValue(leavesOf(golden), data).penalty.data).toBe(0);
  });
});

describe('penalties: still compute sane values on hand-built inputs', () => {
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
