// src/ui/canvas.ts
//
// Renders the twelve line segments on a canvas, redrawn each frame as they evolve. The figure's overall
// scale and position drift along the invariant valley, so the view AUTO-FITS to the current bounding box
// every frame (preserving aspect ratio — angles and length ratios are meaningful and must not distort).

import { N_SEGMENTS, segBase } from '../core/figure';
import type { Figure } from '../core/figure';

const PAD = 36; // px padding inside the canvas

function segColor(i: number): string {
  const hue = (i / N_SEGMENTS) * 320;
  return `hsl(${hue.toFixed(0)}, 70%, 55%)`;
}

export function renderCanvas(
  canvas: HTMLCanvasElement,
  figure: Figure,
  labels: readonly string[],
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
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

  // bounding box over all 24 endpoints
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
  const dataW = Math.max(1e-6, maxX - minX);
  const dataH = Math.max(1e-6, maxY - minY);
  const scale = Math.min((W - 2 * PAD) / dataW, (H - 2 * PAD) / dataH);
  // center the figure in the canvas
  const offX = (W - dataW * scale) / 2;
  const offY = (H - dataH * scale) / 2;
  const tx = (x: number): number => offX + (x - minX) * scale;
  const ty = (y: number): number => H - (offY + (y - minY) * scale); // flip y (up is positive)

  ctx.lineCap = 'round';
  ctx.font = '11px ui-monospace, monospace';
  for (let i = 0; i < N_SEGMENTS; i++) {
    const b = segBase(i);
    const x1 = tx(figure[b]!);
    const y1 = ty(figure[b + 1]!);
    const x2 = tx(figure[b + 2]!);
    const y2 = ty(figure[b + 3]!);
    ctx.strokeStyle = segColor(i);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // start-point dot + label
    ctx.fillStyle = segColor(i);
    ctx.beginPath();
    ctx.arc(x1, y1, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,230,240,0.85)';
    ctx.fillText(labels[i] ?? String(i), x1 + 4, y1 - 4);
  }
}
