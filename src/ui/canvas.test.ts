// src/ui/canvas.test.ts — adversarial tests for the FIXED-viewport rule (spec §UI v2):
// base = figureInit box + 15% margin; NEVER refit per frame; expand smoothly only when the figure
// exceeds it; never shrink mid-run. Pure math — no DOM needed.

import { describe, it, expect } from 'vitest';
import { config } from '../config';
import { seedToFigure, cloneFigure, N_SEGMENTS, segBase } from '../core/figure';
import { createViewport, updateViewport, figureBounds, VIEW_MARGIN_FRAC } from './canvas';

const span = config.figureInit.max - config.figureInit.min;
const margin = span * VIEW_MARGIN_FRAC;

describe('canvas viewport', () => {
  it('base viewport is the figureInit box + 15% margin', () => {
    const v = createViewport();
    expect(v.minX).toBeCloseTo(config.figureInit.min - margin, 12);
    expect(v.minY).toBeCloseTo(config.figureInit.min - margin, 12);
    expect(v.maxX).toBeCloseTo(config.figureInit.max + margin, 12);
    expect(v.maxY).toBeCloseTo(config.figureInit.max + margin, 12);
  });

  it('a figure inside the box leaves the viewport EXACTLY unchanged, frame after frame', () => {
    const fig = seedToFigure(1); // sampled inside the init box by construction
    const v = createViewport();
    const before = { ...v };
    for (let k = 0; k < 200; k++) updateViewport(v, fig);
    expect(v).toEqual(before); // no refit, no drift
  });

  it('a figure escaping the box expands the view smoothly until contained (+margin)', () => {
    const fig = seedToFigure(1);
    fig[0] = 400; // one start-x far right
    const v = createViewport();
    const widths: number[] = [];
    for (let k = 0; k < 300; k++) {
      updateViewport(v, fig);
      widths.push(v.maxX - v.minX);
    }
    // monotone expansion, converging to contain the point plus the margin
    for (let k = 1; k < widths.length; k++) expect(widths[k]!).toBeGreaterThanOrEqual(widths[k - 1]!);
    expect(v.maxX).toBeCloseTo(400 + margin, 3);
    // the untouched edges stay put (expansion is per-edge, not a refit)
    expect(v.minX).toBeCloseTo(config.figureInit.min - margin, 6);
  });

  it('NEVER shrinks mid-run: figure returning inside leaves the expanded view intact', () => {
    const fig = seedToFigure(2);
    const escaped = cloneFigure(fig);
    escaped[1] = -250; // start-y far below
    const v = createViewport();
    for (let k = 0; k < 500; k++) updateViewport(v, escaped);
    const expanded = { ...v };
    for (let k = 0; k < 100; k++) updateViewport(v, fig); // back inside the base box
    expect(v).toEqual(expanded);
  });

  it('figureBounds covers every endpoint and the posited origin', () => {
    const fig = seedToFigure(3);
    const frame = { origin: [-40, 7] as [number, number], direction: [1, 0] as [number, number] };
    const b = figureBounds(fig, frame);
    expect(b.minX).toBeLessThanOrEqual(-40);
    for (let i = 0; i < N_SEGMENTS; i++) {
      const base = segBase(i);
      for (const [x, y] of [
        [fig[base]!, fig[base + 1]!],
        [fig[base + 2]!, fig[base + 3]!],
      ]) {
        expect(x).toBeGreaterThanOrEqual(b.minX);
        expect(x).toBeLessThanOrEqual(b.maxX);
        expect(y).toBeGreaterThanOrEqual(b.minY);
        expect(y).toBeLessThanOrEqual(b.maxY);
      }
    }
  });
});
