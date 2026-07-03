// src/core/assignment.ts
//
// Assignment (CONCEPT.md §7): a map from each data relation to one measurement, legal iff
// type(data) ≤ stamp(measurement) ("read a stamp down, never up"). Two pluggable policies behind
// one interface:
//   • FixedAssignment (bars, use first): sales → length, order → x-position. Deterministic.
//   • BestAssignment (invention): argmax over legal assignments. Lets the figure choose its encoding
//     (radial/dot plots can emerge). Built and pluggable, but NOT the v1 default.

import { config, type Config } from '../config';
import type { DataSet } from './data';
import { orderVector } from './data';
import type { Figure } from './figure';
import type { Page, PositedFrame } from './frame';
import { pageFromConfig, frameFromConfig } from './frame';
import { ScaleType, commensurability } from './scale';
import type { Measurement } from './measurements/types';
import { REGISTRY } from './measurements/registry';

export interface DataRelation {
  readonly key: 'sales' | 'order';
  readonly type: ScaleType;
  /** length-12 data vector. */
  readonly datavec: Float64Array;
}

/** measurement id per data-relation key. */
export type AssignmentMap = ReadonlyMap<DataRelation['key'], string>;

export interface AssignmentContext {
  readonly relations: readonly DataRelation[];
  readonly registry: ReadonlyMap<string, Measurement>;
  readonly figure: Figure;
  readonly frame: PositedFrame;
  readonly page: Page;
  readonly cfg: Config;
  /** reward for a candidate map (figure fixed) — supplied by score.ts to break the import cycle. */
  readonly scoreOf: (map: AssignmentMap) => number;
}

export interface AssignmentPolicy {
  readonly name: string;
  choose(ctx: AssignmentContext): AssignmentMap;
}

/** The two data relations (CONCEPT §2): sales (ratio) and order (ordinal). */
export function dataRelations(data: DataSet): DataRelation[] {
  return [
    { key: 'sales', type: ScaleType.Ratio, datavec: data.values },
    { key: 'order', type: ScaleType.Ordinal, datavec: orderVector() },
  ];
}

/** All measurements a relation may legally use: dataType ≤ stamp. */
export function legalCandidates(
  rel: DataRelation,
  registry: ReadonlyMap<string, Measurement> = REGISTRY,
): Measurement[] {
  return [...registry.values()].filter((m) => commensurability(rel.type, m.stamp));
}

/** Assert a map is legal for the given relations (draws only from legalCandidates). */
export function assertLegal(map: AssignmentMap, relations: readonly DataRelation[], registry = REGISTRY): void {
  for (const rel of relations) {
    const id = map.get(rel.key);
    if (id === undefined) throw new Error(`Assignment missing relation '${rel.key}'`);
    const m = registry.get(id);
    if (!m) throw new Error(`Assignment uses unknown measurement '${id}'`);
    if (!commensurability(rel.type, m.stamp)) {
      throw new Error(`Illegal assignment ${rel.key}(${rel.type}) → ${id}(${m.stamp})`);
    }
  }
}

// ── FixedAssignment (default): bars ──────────────────────────────────────────────

export const FixedAssignment: AssignmentPolicy = {
  name: 'fixed',
  choose(ctx: AssignmentContext): AssignmentMap {
    const map = new Map<DataRelation['key'], string>();
    map.set('sales', ctx.cfg.fixedCarriers.sales);
    map.set('order', ctx.cfg.fixedCarriers.order);
    assertLegal(map, ctx.relations, ctx.registry);
    return map;
  },
};

// ── BestAssignment (invention): argmax over legal assignments ─────────────────────

export const BestAssignment: AssignmentPolicy = {
  name: 'best',
  choose(ctx: AssignmentContext): AssignmentMap {
    const perRelation = ctx.relations.map((rel) => ({
      key: rel.key,
      ids: legalCandidates(rel, ctx.registry).map((m) => m.id),
    }));
    let best: AssignmentMap | null = null;
    let bestScore = -Infinity;
    // enumerate the product of legal candidates (small: 20 × 26 = 520 under the v2.2 lattice)
    const rec = (i: number, acc: Map<DataRelation['key'], string>): void => {
      if (i === perRelation.length) {
        const s = ctx.scoreOf(acc);
        if (s > bestScore) {
          bestScore = s;
          best = new Map(acc);
        }
        return;
      }
      const { key, ids } = perRelation[i]!;
      for (const id of ids) {
        acc.set(key, id);
        rec(i + 1, acc);
      }
    };
    rec(0, new Map());
    if (!best) throw new Error('BestAssignment found no legal candidates');
    return best;
  },
};

export const POLICIES: Record<string, AssignmentPolicy> = {
  fixed: FixedAssignment,
  best: BestAssignment,
};

export function policyFromConfig(cfg: Config = config): AssignmentPolicy {
  return POLICIES[cfg.assignmentPolicy] ?? FixedAssignment;
}

/** Build a default assignment context (page/frame from config). */
export function makeContext(
  data: DataSet,
  figure: Figure,
  scoreOf: (map: AssignmentMap) => number,
  cfg: Config = config,
  frame: PositedFrame = frameFromConfig(cfg),
  page: Page = pageFromConfig(cfg),
): AssignmentContext {
  return { relations: dataRelations(data), registry: REGISTRY, figure, frame, page, cfg, scoreOf };
}
