// src/persistence/store.test.ts — serialize/deserialize round-trip for a saved Result.
//
// v2: result() is defined to carry session.best() (session API contract), and the score is the v2
// Breakdown — the round-trip must preserve the per-relation carrier rows (label, salience, q,
// signedTau, per-rung fidelities) and the penalty terms the score panel renders after Load.

import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from './store';
import { createSession } from '../optim/session';

describe('persistence: serialize/deserialize round-trip', () => {
  it('preserves figure, data, seeds, and score through JSON', () => {
    const s = createSession(2, 3);
    for (let i = 0; i < 50; i++) s.step();
    const r = s.result();
    const round = deserialize(JSON.parse(JSON.stringify(serialize(r))));
    expect(round.figureSeed).toBe(2);
    expect(round.dataSeed).toBe(3);
    expect(Array.from(round.figure)).toEqual(Array.from(r.figure));
    expect(Array.from(round.data.values)).toEqual(Array.from(r.data.values));
    expect(round.data.labels).toEqual([...r.data.labels]);
    expect(round.score.total).toBeCloseTo(r.score.total, 9);
    expect(round.figure).toBeInstanceOf(Float64Array);
    expect(round.data.values).toBeInstanceOf(Float64Array);
  });

  it('preserves the FULL v2 breakdown: carrier rows, rungs, penalties, dedup counts', () => {
    const s = createSession(4, 5);
    for (let i = 0; i < 10; i++) s.step();
    const r = s.result();
    const round = deserialize(JSON.parse(JSON.stringify(serialize(r))));
    expect(round.score.quality).toBeCloseTo(r.score.quality, 12);
    expect(round.score.distinctCarriers).toBe(r.score.distinctCarriers);
    expect(round.score.censusSize).toBe(r.score.censusSize);
    expect(round.score.relations.length).toBe(r.score.relations.length);
    for (let i = 0; i < r.score.relations.length; i++) {
      const a = r.score.relations[i]!;
      const b = round.score.relations[i]!;
      expect(b.key).toBe(a.key);
      expect(b.aggregated).toBeCloseTo(a.aggregated, 12);
      expect(b.carriers.length).toBe(a.carriers.length);
      for (let j = 0; j < a.carriers.length; j++) {
        const ca = a.carriers[j]!;
        const cb = b.carriers[j]!;
        expect(cb.label).toBe(ca.label);
        expect(cb.salience).toBeCloseTo(ca.salience, 12);
        expect(cb.q).toBeCloseTo(ca.q, 12);
        expect(cb.signedTau).toBeCloseTo(ca.signedTau, 12);
        expect(cb.aliases).toEqual([...ca.aliases]);
        expect(cb.rungs.map((x) => x.name)).toEqual(ca.rungs.map((x) => x.name));
      }
    }
    // the penalty terms (data-ink row) survive with weights intact
    expect(round.score.penalties.map((p) => p.name)).toEqual(r.score.penalties.map((p) => p.name));
    for (let i = 0; i < r.score.penalties.length; i++) {
      expect(round.score.penalties[i]!.weighted).toBeCloseTo(r.score.penalties[i]!.weighted, 12);
    }
  });
});
