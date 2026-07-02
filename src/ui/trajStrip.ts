// src/ui/trajStrip.ts
//
// The trajectory GALLERY: one thumbnail per trajectory EVER started this session, from
// session.allTrajectories() — live ones updating each frame, finished ones frozen as endpoints
// (score, status badge, kind, steps). Entries are keyed by STABLE trajectory id, appended in
// creation order, and never removed or reordered; the strip scrolls horizontally on overflow.
//
// Two marks, deliberately distinct (sticky-selection spec):
//   • `.selected` — the user's sticky selection (moves ONLY on a thumbnail click; app owns it),
//   • `.best`     — a subtle marker on the current best-by-exact-total (may move freely).
//
// Each trajectory keeps its OWN fixed viewport (same rule as the main canvas: base box + margin,
// expand only), keyed by id — a replacement trajectory has a new id and therefore a fresh viewport.
// Frozen endpoints are drawn once and then skipped (their figures never change).

import type { TrajectoryView } from './sessionApi';
import { createViewport, updateViewport, renderCanvas, type Viewport } from './canvas';

const KIND_LABEL: Record<TrajectoryView['kind'], string> = {
  initial: 'init',
  'restart-fresh': 'fresh',
  'restart-mutant': 'mutant',
};

export interface TrajStripState {
  views: Map<number, Viewport>; // per-trajectory fixed viewport, keyed by stable id
  drawnSteps: Map<number, number>; // last step count drawn per id (skip repaint of frozen endpoints)
}

export function createTrajStripState(): TrajStripState {
  return { views: new Map(), drawnSteps: new Map() };
}

function buildCells(root: HTMLElement, trajs: readonly TrajectoryView[]): void {
  root.innerHTML = trajs
    .map(
      (t) => `<div class="traj" data-id="${t.id}" title="click to select this trajectory">
      <canvas class="trajcanvas"></canvas>
      <div class="trajmeta">
        <span class="tscore" data-t="score"></span>
        <span class="tbadge" data-t="status"></span>
        <span class="tkind muted" data-t="kind"></span>
      </div>
    </div>`,
    )
    .join('');
}

export function renderTrajStrip(
  root: HTMLElement,
  trajs: readonly TrajectoryView[],
  state: TrajStripState,
  selectedId: number,
): void {
  // The gallery only ever APPENDS (ids are stable, creation-ordered): rebuild on count change.
  if (root.childElementCount !== trajs.length) {
    buildCells(root, trajs);
    state.drawnSteps.clear(); // canvases are blank after a rebuild — repaint everything once
  }
  let bestId = -1;
  let bestScore = -Infinity;
  for (const t of trajs) {
    if (Number.isFinite(t.exactTotal) && t.exactTotal > bestScore) {
      bestScore = t.exactTotal;
      bestId = t.id;
    }
  }
  for (let i = 0; i < trajs.length; i++) {
    const t = trajs[i]!;
    const el = root.children[i] as HTMLElement;
    if (!state.views.has(t.id)) state.views.set(t.id, createViewport());
    const view = state.views.get(t.id)!;
    // Repaint only when the trajectory advanced (or was never drawn): endpoints stay frozen.
    if (state.drawnSteps.get(t.id) !== t.steps) {
      updateViewport(view, t.figure);
      renderCanvas(el.querySelector('.trajcanvas') as HTMLCanvasElement, t.figure, view, {
        pad: 5,
        lineWidth: 1.5,
      });
      state.drawnSteps.set(t.id, t.steps);
    }
    el.classList.toggle('best', t.id === bestId);
    el.classList.toggle('selected', t.id === selectedId);
    (el.querySelector('[data-t="score"]') as HTMLElement).textContent = t.exactTotal.toFixed(3);
    const badge = el.querySelector('[data-t="status"]') as HTMLElement;
    badge.textContent = t.status === 'plateaued' ? 'converged' : t.status;
    badge.className = `tbadge ${t.status}`;
    (el.querySelector('[data-t="kind"]') as HTMLElement).textContent =
      `${KIND_LABEL[t.kind]} · ${t.steps}`;
  }
}
