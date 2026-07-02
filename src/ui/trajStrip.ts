// src/ui/trajStrip.ts
//
// The trajectory strip (scoring-v2 design §Optimizer v2 / §UI v2): one thumbnail per population
// slot from session.trajectories(), so the user watches EVERY evolution play out — mini canvas,
// exact score, live status badge (running / plateaued / capped), and the trajectory's kind
// (initial / fresh restart / mutant-of-best). The main canvas follows session.best(); the current
// best slot is outlined here.
//
// Each slot keeps its OWN fixed viewport (same rule as the main canvas: base box + margin, expand
// only), reset when a new trajectory occupies the slot (detected by its step counter going down).

import type { TrajectoryView } from './sessionApi';
import { createViewport, updateViewport, renderCanvas, type Viewport } from './canvas';

const KIND_LABEL: Record<TrajectoryView['kind'], string> = {
  initial: 'init',
  'restart-fresh': 'fresh',
  'restart-mutant': 'mutant',
};

export interface TrajStripState {
  views: Map<number, Viewport>;
  lastSteps: Map<number, number>;
}

export function createTrajStripState(): TrajStripState {
  return { views: new Map(), lastSteps: new Map() };
}

function buildSlots(root: HTMLElement, n: number): void {
  root.innerHTML = Array.from(
    { length: n },
    (_, i) => `<div class="traj" data-slot="${i}">
      <canvas class="trajcanvas"></canvas>
      <div class="trajmeta">
        <span class="tscore" data-t="score"></span>
        <span class="tbadge" data-t="status"></span>
        <span class="tkind muted" data-t="kind"></span>
      </div>
    </div>`,
  ).join('');
}

export function renderTrajStrip(
  root: HTMLElement,
  trajs: readonly TrajectoryView[],
  state: TrajStripState,
): void {
  if (root.childElementCount !== trajs.length) {
    buildSlots(root, trajs.length);
    state.views.clear();
    state.lastSteps.clear();
  }
  let bestSlot = -1;
  let bestScore = -Infinity;
  for (const t of trajs) {
    if (Number.isFinite(t.exactTotal) && t.exactTotal > bestScore) {
      bestScore = t.exactTotal;
      bestSlot = t.slot;
    }
  }
  for (let i = 0; i < trajs.length; i++) {
    const t = trajs[i]!;
    const el = root.children[i] as HTMLElement;
    // a new trajectory took this slot (restart): its step counter reset → fresh viewport
    const last = state.lastSteps.get(t.slot);
    if (last === undefined || t.steps < last) state.views.set(t.slot, createViewport());
    state.lastSteps.set(t.slot, t.steps);
    const view = state.views.get(t.slot)!;
    updateViewport(view, t.figure);
    renderCanvas(el.querySelector('.trajcanvas') as HTMLCanvasElement, t.figure, view, {
      pad: 5,
      lineWidth: 1.5,
    });
    el.classList.toggle('best', t.slot === bestSlot);
    (el.querySelector('[data-t="score"]') as HTMLElement).textContent = t.exactTotal.toFixed(3);
    const badge = el.querySelector('[data-t="status"]') as HTMLElement;
    badge.textContent = t.status === 'plateaued' ? 'converged' : t.status;
    badge.className = `tbadge ${t.status}`;
    (el.querySelector('[data-t="kind"]') as HTMLElement).textContent =
      `${KIND_LABEL[t.kind]} · ${t.steps}`;
  }
}
