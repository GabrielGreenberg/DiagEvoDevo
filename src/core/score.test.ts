// src/core/score.test.ts — M4 gate for the total score, golden bar chart, invariances, penalties.

import { describe, it, expect } from 'vitest';
import { val, backward, type Value } from './autograd/engine';
import { config, type Config } from '../config';
import { cloneFigure, segBase, type Figure } from './figure';
import { pageFromConfig, frameFromConfig } from './frame';
import { FixedAssignment } from './assignment';
import { scoreExact, scoreValue, resolveAssignment } from './score';
import { maxRewardFor } from './fidelity/rungs';
import { ScaleType } from './scale';
import { REGISTRY } from './measurements/registry';
import { frozenDof } from './penalties/frozenDof';
import { spuriousness } from './penalties/spuriousness';
import { economy } from './penalties/economy';
import type { PenaltyContext } from './penalties/registry';
import { wellSeparatedData, goldenBarChart } from './fixtures';

const data = wellSeparatedData();
const golden = goldenBarChart(data);
const map = resolveAssignment(FixedAssignment, data, golden);
const frame = frameFromConfig();
const page = pageFromConfig();
const MAX_REWARD = maxRewardFor(ScaleType.Ratio, config) + maxRewardFor(ScaleType.Ordinal, config); // 8
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));
const penCtx: PenaltyContext = { map, registry: REGISTRY, frame, page, data, cfg: config };

describe('score: golden bar chart scores the max reward', () => {
  it('exact reward = maxReward, quality = 1, every rung ≈ 1', () => {
    const b = scoreExact(golden, data, map);
    expect(b.reward).toBeCloseTo(MAX_REWARD, 6);
    expect(b.quality).toBeCloseTo(1, 6);
    for (const a of b.assignments) {
      for (const r of a.rungs) expect(r.f, `${a.key}.${r.name}`).toBeCloseTo(1, 6);
    }
    // sales gets 3 rungs, order gets 1 rung
    expect(b.assignments.find((a) => a.key === 'sales')!.rungs.map((r) => r.name)).toEqual([
      'ord',
      'int',
      'ratio',
    ]);
    expect(b.assignments.find((a) => a.key === 'order')!.rungs.map((r) => r.name)).toEqual(['ord']);
  });
  it('differentiable reward → exact reward as the (normalized) temperature sharpens', () => {
    // At the default T the spread-normalized ordinal surrogate sits a little below the exact Kendall
    // value; as T→0 it sharpens to agree. (The score panel shows the exact form regardless.)
    const se = scoreExact(golden, data, map).reward;
    const sharp: Config = { ...config, T: 0.005 };
    expect(Math.abs(scoreValue(leavesOf(golden), data, map, sharp).reward.data - se)).toBeLessThan(0.01);
  });
});

describe('score: invariances leave the reward unchanged (to ε)', () => {
  const base = scoreExact(golden, data, map).reward;
  it('global height scale k', () => {
    expect(scoreExact(goldenBarChart(data, { k: 5 }), data, map).reward).toBeCloseTo(base, 6);
    expect(scoreExact(goldenBarChart(data, { k: 0.01 }), data, map).reward).toBeCloseTo(base, 6);
  });
  it('horizontal translation', () => {
    expect(scoreExact(goldenBarChart(data, { x0: 5000 }), data, map).reward).toBeCloseTo(base, 6);
  });
  it('horizontal spacing (ordinal is spacing-invariant)', () => {
    expect(scoreExact(goldenBarChart(data, { spacing: 3 }), data, map).reward).toBeCloseTo(base, 6);
    expect(scoreExact(goldenBarChart(data, { spacing: 137 }), data, map).reward).toBeCloseTo(base, 6);
  });
  it('vertical baseline shift (baseline is a frozen DOF, not scored)', () => {
    expect(scoreExact(goldenBarChart(data, { baseline: 400 }), data, map).reward).toBeCloseTo(base, 6);
  });
});

describe('score: non-invariant perturbations strictly lower the reward', () => {
  const base = scoreExact(golden, data, map).reward;
  it('breaking one bar height proportionality lowers the ratio rung', () => {
    const f = cloneFigure(golden);
    const b3 = segBase(3);
    f[b3 + 3] = f[b3 + 1]! + 1.7 * (f[b3 + 3]! - f[b3 + 1]!); // bar 3 = 1.7× its correct height
    const s = scoreExact(f, data, map);
    expect(s.reward).toBeLessThan(base - 1e-6);
    expect(s.assignments.find((a) => a.key === 'sales')!.rungs.find((r) => r.name === 'ratio')!.f).toBeLessThan(1);
  });
  it('breaking the left-to-right order lowers the ordinal rung', () => {
    const f = cloneFigure(golden);
    const b3 = segBase(3);
    const b4 = segBase(4);
    // swap the x-positions of bars 3 and 4 → start x no longer monotone
    [f[b3], f[b3 + 2], f[b4], f[b4 + 2]] = [f[b4]!, f[b4 + 2]!, f[b3]!, f[b3 + 2]!];
    const s = scoreExact(f, data, map);
    expect(s.reward).toBeLessThan(base - 1e-6);
    expect(s.assignments.find((a) => a.key === 'order')!.rungs.find((r) => r.name === 'ord')!.f).toBeLessThan(1);
  });
});

describe('score: penalties are wired but zero-weighted (no effect on v1 total)', () => {
  it('all penalties are 0 at default weights; total = reward', () => {
    const b = scoreExact(golden, data, map);
    expect(b.penalty).toBe(0);
    expect(b.total).toBeCloseTo(b.reward, 12);
    for (const p of b.penalties) expect(p.weight).toBe(0);
    // differentiable penalty is also 0
    expect(scoreValue(leavesOf(golden), data, map).penalty.data).toBe(0);
  });
});

describe('penalties: each computes a sane value on hand-built inputs', () => {
  it('frozenDof ≈ 0 for a shared baseline + common orientation; > 0 for drift', () => {
    // golden: baseline 0, tilt all π/2 ⇒ frozenDof ≈ 0 AND ≥ 0 (penalty must never go negative)
    expect(frozenDof.valueExact(golden, penCtx)).toBeGreaterThanOrEqual(0);
    expect(frozenDof.valueExact(golden, penCtx)).toBeLessThan(1e-9);
    // drift: vary each start y (baseline spread), keep vertical
    const drift = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      const h = drift[b + 3]! - drift[b + 1]!;
      drift[b + 1] = i * 7; // baseline now varies
      drift[b + 3] = i * 7 + h;
    }
    expect(frozenDof.valueExact(drift, penCtx)).toBeGreaterThan(0);
    // differentiable value matches exact
    expect(frozenDof.value(leavesOf(drift), penCtx).data).toBeCloseTo(
      frozenDof.valueExact(drift, penCtx),
      9,
    );
  });

  it('spuriousness ∈ [0,1], high for evenly-spaced x, lower for uneven spacing', () => {
    const sGolden = spuriousness.valueExact(golden, penCtx); // even spacing ⇒ near 1
    expect(sGolden).toBeGreaterThan(0.9);
    expect(sGolden).toBeLessThanOrEqual(1 + 1e-9);
    // ordered but non-linear spacing
    const uneven = cloneFigure(golden);
    const xs = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      uneven[b] = xs[i]!;
      uneven[b + 2] = xs[i]!;
    }
    const sUneven = spuriousness.valueExact(uneven, penCtx);
    expect(sUneven).toBeLessThan(sGolden);
    expect(sUneven).toBeGreaterThanOrEqual(0);
  });

  it('economy = active measurements + posited frames = 2 for FixedAssignment (constant, zero grad)', () => {
    expect(economy.valueExact(golden, penCtx)).toBe(2);
    const leaves = leavesOf(golden);
    const e = economy.value(leaves, penCtx);
    expect(e.data).toBe(2);
    backward(e);
    expect(leaves.every((l) => l.grad === 0)).toBe(true); // structural ⇒ no pull on coordinates
  });
});

describe('score: enabling a penalty weight has the intended effect (no code change)', () => {
  it('frozenDof weight 1 subtracts the drift penalty from the total', () => {
    const cfg2: Config = { ...config, penalties: { ...config.penalties, frozenDof: 1 } };
    const drift = cloneFigure(golden);
    for (let i = 0; i < 12; i++) {
      const b = segBase(i);
      const h = drift[b + 3]! - drift[b + 1]!;
      drift[b + 1] = i * 7;
      drift[b + 3] = i * 7 + h;
    }
    const b = scoreExact(drift, data, map, cfg2);
    expect(b.penalty).toBeGreaterThan(0);
    expect(b.total).toBeCloseTo(b.reward - b.penalty, 9);
    // golden has ~zero frozenDof even with the weight on
    expect(scoreExact(golden, data, map, cfg2).penalty).toBeLessThan(1e-6);
  });
});
