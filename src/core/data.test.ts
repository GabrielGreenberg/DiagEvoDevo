// src/core/data.test.ts — M1 gate for the dataset.

import { describe, it, expect } from 'vitest';
import { seedToDataSet, orderVector, labelFor } from './data';
import { config, N_ITEMS } from '../config';

describe('data: labels', () => {
  it('are A..L, length 12, in order', () => {
    const d = seedToDataSet(1);
    expect(d.labels.length).toBe(N_ITEMS);
    expect(d.labels.join('')).toBe('ABCDEFGHIJKL');
    expect(labelFor(0)).toBe('A');
    expect(labelFor(11)).toBe('L');
  });
});

describe('data: determinism (byte-identical from same seed)', () => {
  it('same seed → identical values across calls', () => {
    const a = seedToDataSet(42);
    const b = seedToDataSet(42);
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
  });
  it('different seeds → different values', () => {
    const a = seedToDataSet(1);
    const b = seedToDataSet(2);
    expect(Array.from(a.values)).not.toEqual(Array.from(b.values));
  });
});

describe('data: values are strictly positive (ratio scale) and in range', () => {
  it('every value > 0, finite, within [min, max] for many seeds', () => {
    for (let s = 0; s < 200; s++) {
      const d = seedToDataSet(s);
      expect(d.values.length).toBe(N_ITEMS);
      for (const v of d.values) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeGreaterThanOrEqual(config.dataInit.min - 1e-6);
        expect(v).toBeLessThanOrEqual(config.dataInit.max + 1e-6);
      }
    }
  });
});

describe('data: values are independent of label order', () => {
  it('is not always sorted ascending (order and value families are independent)', () => {
    let sawUnsorted = false;
    for (let s = 0; s < 50 && !sawUnsorted; s++) {
      const d = seedToDataSet(s);
      for (let i = 1; i < d.values.length; i++) {
        if (d.values[i]! < d.values[i - 1]!) sawUnsorted = true;
      }
    }
    expect(sawUnsorted).toBe(true);
  });
});

describe('data: order vector', () => {
  it('is 0..11 (monotone stand-in for A<…<L)', () => {
    expect(Array.from(orderVector())).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
