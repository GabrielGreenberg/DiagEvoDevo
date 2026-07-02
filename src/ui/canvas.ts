// src/ui/canvas.ts
//
// Renders the twelve line segments on a canvas, redrawn each frame as they evolve.
//
// v2 viewport (scoring-v2 design §UI v2): the view is FIXED at the figureInit sampling box plus a
// 15% margin — it is NEVER refit per frame (the per-frame auto-fit is what made the frame appear to
// "move vertically" in v1). If the evolving figure exceeds the viewport, the viewport EXPANDS
// smoothly (lerp) just enough to contain it; it never shrinks mid-run. A new run gets a fresh base
// viewport (createViewport).

import { config, type Config } from '../config';
import { N_SEGMENTS, segBase } from '../core/figure';
import type { Figure } from '../core/figure';
import type { PositedFrame } from '../core/frame';
import { unit, perp } from '../core/frame';

// Display-only parameters (no effect on the score or the optimizer — the scoring/optimizer tunables
// all live in src/config.ts; these shape pixels, not math).
export const VIEW_MARGIN_FRAC = 0.15; // margin around the figureInit box, as a fraction of its span
export const VIEW_EXPAND_LERP = 0.2; // per-frame interpolation toward an expanded viewport (1 = snap)
const PAD = 36; // px padding inside the main canvas

/** The world-coordinate rectangle currently shown. Mutable state owned by the caller (one per run). */
export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The fixed base viewport: figureInit box + VIEW_MARGIN_FRAC margin (0..100 → −15..115). */
export function createViewport(cfg: Config = config): Viewport {
  const span = cfg.figureInit.max - cfg.figureInit.min;
  const m = span * VIEW_MARGIN_FRAC;
  return {
    minX: cfg.figureInit.min - m,
    minY: cfg.figureInit.min - m,
    maxX: cfg.figureInit.max + m,
    maxY: cfg.figureInit.max + m,
  };
}

/** Bounding box over all segment endpoints (and the posited origin, kept in view). */
export function figureBounds(figure: Figure, frame?: PositedFrame): Viewport {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const acc = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (let i = 0; i < N_SEGMENTS; i++) {
    const b = segBase(i);
    acc(figure[b]!, figure[b + 1]!);
    acc(figure[b + 2]!, figure[b + 3]!);
  }
  if (frame) acc(frame.origin[0], frame.origin[1]);
  return { minX, minY, maxX, maxY };
}

/**
 * Advance the viewport one frame: if the figure (plus the standard margin) exceeds the current view,
 * lerp each edge OUTWARD toward containing it. Edges only ever move outward — the viewport never
 * shrinks mid-run, and a figure inside the view leaves it exactly unchanged.
 */
export function updateViewport(
  view: Viewport,
  figure: Figure,
  frame?: PositedFrame,
  lerp: number = VIEW_EXPAND_LERP,
  cfg: Config = config,
): Viewport {
  const b = figureBounds(figure, frame);
  const m = (cfg.figureInit.max - cfg.figureInit.min) * VIEW_MARGIN_FRAC;
  view.minX += Math.min(0, b.minX - m - view.minX) * lerp;
  view.minY += Math.min(0, b.minY - m - view.minY) * lerp;
  view.maxX += Math.max(0, b.maxX + m - view.maxX) * lerp;
  view.maxY += Math.max(0, b.maxY + m - view.maxY) * lerp;
  return view;
}

function segColor(i: number): string {
  const hue = (i / N_SEGMENTS) * 320;
  return `hsl(${hue.toFixed(0)}, 70%, 55%)`;
}

export interface RenderOptions {
  labels?: readonly string[]; // per-segment labels (omitted for thumbnails)
  frame?: PositedFrame; // posited frame to draw (origin + axes)
  pad?: number; // px padding inside the canvas
  lineWidth?: number;
}

/** Draw the figure through the given (fixed) viewport, preserving aspect ratio. */
export function renderCanvas(
  canvas: HTMLCanvasElement,
  figure: Figure,
  view: Viewport,
  opts: RenderOptions = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pad = opts.pad ?? PAD;
  const lineWidth = opts.lineWidth ?? 3;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(1, rect.width);
  const H = Math.max(1, rect.height);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const viewW = Math.max(1e-6, view.maxX - view.minX);
  const viewH = Math.max(1e-6, view.maxY - view.minY);
  const scale = Math.min((W - 2 * pad) / viewW, (H - 2 * pad) / viewH);
  // center the viewport in the canvas
  const offX = (W - viewW * scale) / 2;
  const offY = (H - viewH * scale) / 2;
  const tx = (x: number): number => offX + (x - view.minX) * scale;
  const ty = (y: number): number => H - (offY + (y - view.minY) * scale); // flip y (up is positive)

  // posited reference frame (origin + axes) — the anchor for frame-stamped measurements. Inert in
  // v1 geometry (frame ∥ page) but drawn so it is explicit; it becomes load-bearing at M8/M9.
  const frame = opts.frame;
  if (frame) {
    const [ox, oy] = frame.origin;
    const u = unit(frame.direction);
    const w = perp(u);
    const big = Math.max(viewW, viewH) * 3 + 1;
    const axis = (dx: number, dy: number, alpha: number): void => {
      ctx.strokeStyle = `rgba(124,136,168,${alpha})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(tx(ox - dx * big), ty(oy - dy * big));
      ctx.lineTo(tx(ox + dx * big), ty(oy + dy * big));
      ctx.stroke();
    };
    axis(u[0], u[1], 0.38); // the frame direction axis
    axis(w[0], w[1], 0.22); // its normal
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(158,168,198,0.85)';
    ctx.beginPath();
    ctx.arc(tx(ox), ty(oy), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('frame O', tx(ox) + 6, ty(oy) + 13);
  }

  ctx.lineCap = 'round';
  ctx.font = '11px ui-monospace, monospace';
  const labels = opts.labels;
  for (let i = 0; i < N_SEGMENTS; i++) {
    const b = segBase(i);
    const x1 = tx(figure[b]!);
    const y1 = ty(figure[b + 1]!);
    const x2 = tx(figure[b + 2]!);
    const y2 = ty(figure[b + 3]!);
    ctx.strokeStyle = segColor(i);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // start-point dot (+ label on the main canvas)
    ctx.fillStyle = segColor(i);
    ctx.beginPath();
    ctx.arc(x1, y1, lineWidth >= 3 ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (labels) {
      ctx.fillStyle = 'rgba(230,230,240,0.85)';
      ctx.fillText(labels[i] ?? String(i), x1 + 4, y1 - 4);
    }
  }
}
