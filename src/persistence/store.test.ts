// src/persistence/store.test.ts — serialize/deserialize round-trip for a Result.

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
});
