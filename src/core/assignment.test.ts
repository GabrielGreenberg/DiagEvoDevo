// src/core/assignment.test.ts — M4 gate for assignment legality + policies.

import { describe, it, expect } from 'vitest';
import {
  dataRelations,
  legalCandidates,
  assertLegal,
  FixedAssignment,
  BestAssignment,
  makeContext,
  type AssignmentMap,
} from './assignment';
import { REGISTRY } from './measurements/registry';
import { ScaleType } from './scale';
import { rewardOf, resolveAssignment } from './score';
import { wellSeparatedData, goldenBarChart } from './fixtures';
import { config } from '../config';

const data = wellSeparatedData();
const golden = goldenBarChart(data);

describe('assignment: legal candidates (commensurability dataType ≤ stamp, v2 census)', () => {
  const [sales, order] = dataRelations(data);
  it('sales (ratio) → exactly the 15 ratio measurements pre-dedup (v2: cyclic demoted, 20 → 15)', () => {
    const c = legalCandidates(sales!, REGISTRY);
    expect(c.length).toBe(15);
    expect(c.every((m) => m.stamp === ScaleType.Ratio)).toBe(true);
    expect(c.some((m) => m.stamp === ScaleType.Cyclic)).toBe(false); // no ratio-from-bearing
  });
  it('order (ordinal) → all 26 measurements (interval ∪ ratio ∪ cyclic; order readable from angles)', () => {
    const c = legalCandidates(order!, REGISTRY);
    expect(c.length).toBe(26);
    expect(c.filter((m) => m.stamp === ScaleType.Interval).length).toBe(6);
    expect(c.filter((m) => m.stamp === ScaleType.Ratio).length).toBe(15);
    expect(c.filter((m) => m.stamp === ScaleType.Cyclic).length).toBe(5); // angles carry order
  });
});

describe('assignment: FixedAssignment', () => {
  it('maps sales→length#9, order→x-position#1, both legal', () => {
    const ctx = makeContext(data, golden, () => 0, config);
    const map = FixedAssignment.choose(ctx);
    expect(map.get('sales')).toBe('page.displacement.magnitude');
    expect(map.get('order')).toBe('page.start.projPar');
    expect(() => assertLegal(map, dataRelations(data))).not.toThrow();
  });
  it('rejects an illegal map (sales → an interval measurement)', () => {
    const illegal: AssignmentMap = new Map([
      ['sales', 'page.start.projPar'], // interval — illegal for ratio sales
      ['order', 'page.start.projPar'],
    ]);
    expect(() => assertLegal(illegal, dataRelations(data))).toThrow(/Illegal assignment/);
  });
});

describe('assignment: BestAssignment (argmax over legal maps)', () => {
  it('returns a legal map and reward ≥ the fixed reward on the golden chart', () => {
    const fixedReward = rewardOf(golden, data, resolveAssignment(FixedAssignment, data, golden));
    const bestMap = resolveAssignment(BestAssignment, data, golden);
    expect(() => assertLegal(bestMap, dataRelations(data))).not.toThrow();
    const bestReward = rewardOf(golden, data, bestMap);
    expect(bestReward).toBeGreaterThanOrEqual(fixedReward - 1e-9);
  });
  it('never assigns a cyclic carrier to SALES (ratio ≰ cyclic); the whole map stays legal', () => {
    const bestMap = resolveAssignment(BestAssignment, data, golden);
    expect(REGISTRY.get(bestMap.get('sales')!)!.stamp).not.toBe(ScaleType.Cyclic);
    expect(() => assertLegal(bestMap, dataRelations(data))).not.toThrow();
  });
});
