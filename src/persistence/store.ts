// src/persistence/store.ts
//
// Save/load a Result to localStorage as JSON. A saved Result is reproducible from its seeds + config
// snapshot (CONCEPT.md / ARCHITECTURE.md persistence spec); we also store the final figure so a load
// can display it without re-running. Typed arrays are serialized as plain number[] (JSON has no
// Float64Array). Load honors the STORED config snapshot, not live config.

import type { SessionResult } from '../optim/session';
import type { Breakdown } from '../core/score';
import type { Config } from '../config';

const KEY = 'diagram-evolver:results';

export interface SerializedResult {
  figureSeed: number;
  dataSeed: number;
  figure: number[];
  data: { labels: string[]; values: number[]; seed: number };
  topCarriers: Record<string, string>;
  score: Breakdown;
  converged: boolean;
  convergedByCap: boolean;
  steps: number;
  configSnapshot: Config;
  savedAtStep: number;
}

export function serialize(r: SessionResult): SerializedResult {
  return {
    figureSeed: r.figureSeed,
    dataSeed: r.dataSeed,
    figure: Array.from(r.figure),
    data: { labels: [...r.data.labels], values: Array.from(r.data.values), seed: r.data.seed },
    topCarriers: r.topCarriers,
    score: r.score,
    converged: r.converged,
    convergedByCap: r.convergedByCap,
    steps: r.steps,
    configSnapshot: r.configSnapshot,
    savedAtStep: r.steps,
  };
}

export function deserialize(s: SerializedResult): SessionResult {
  return {
    figureSeed: s.figureSeed,
    dataSeed: s.dataSeed,
    figure: Float64Array.from(s.figure),
    data: { labels: s.data.labels, values: Float64Array.from(s.data.values), seed: s.data.seed },
    topCarriers: s.topCarriers,
    score: s.score,
    converged: s.converged,
    convergedByCap: s.convergedByCap,
    steps: s.steps,
    configSnapshot: s.configSnapshot,
  };
}

function storage(): Storage | null {
  try {
    // Guard the full API surface: some DOM shims (e.g. jsdom without a URL origin) expose a
    // `localStorage` object whose Storage methods are missing — treat that as "no storage".
    if (
      typeof localStorage !== 'undefined' &&
      typeof localStorage.getItem === 'function' &&
      typeof localStorage.setItem === 'function' &&
      typeof localStorage.removeItem === 'function'
    ) {
      return localStorage;
    }
    return null;
  } catch {
    return null;
  }
}

export function listSerialized(): SerializedResult[] {
  const s = storage();
  if (!s) return [];
  const raw = s.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SerializedResult[];
  } catch {
    return [];
  }
}

/** Persist a result; returns the new list length. */
export function saveResult(r: SessionResult): number {
  const s = storage();
  const list = listSerialized();
  list.push(serialize(r));
  if (s) s.setItem(KEY, JSON.stringify(list));
  return list.length;
}

export function loadLatest(): SessionResult | null {
  const list = listSerialized();
  const last = list[list.length - 1];
  return last ? deserialize(last) : null;
}

export function clearResults(): void {
  storage()?.removeItem(KEY);
}
