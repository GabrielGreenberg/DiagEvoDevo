// src/ui/trajStrip.ts
//
// The trajectory GALLERY: one thumbnail per trajectory EVER started this session, from
// session.allTrajectories() — live ones updating each frame, finished ones frozen as endpoints
// (score, status badge, kind, steps). Entries are keyed by STABLE trajectory id, appended in
// creation order, and never removed or reordered; the strip scrolls horizontally on overflow.
//
// The optional REFERENCE cell (src/ui/reference.ts) renders FIRST, before every trajectory: the
// hand-built golden bars of this session's dataset, scored under the session's objective. It is
// visually distinct (its own `.refcell` class — dashed border — and a "bars" badge in place of the
// status badge + kind tag; it is not an optimization, so it has neither). It is selectable like a
// thumbnail via the sentinel REFERENCE_ID, but NEVER eligible for the ★ best marker.
//
// Two marks, deliberately distinct (sticky-selection spec):
//   • `.selected` — the user's sticky selection (moves ONLY on a thumbnail click; app owns it),
//   • `.best`     — a subtle marker on the current best-by-exact-total ACROSS TRAJECTORIES ONLY
//     (may move freely; the reference is excluded by construction).
//
// Each trajectory keeps its OWN fixed viewport (same rule as the main canvas: base box + margin,
// expand only), keyed by id — a replacement trajectory has a new id and therefore a fresh viewport.
// Frozen endpoints are drawn once and then skipped (their figures never change); the reference is
// likewise drawn once (its figure is fixed for the whole session).

import type { TrajectoryView } from './sessionApi';
import { REFERENCE_ID, type ReferenceView } from './reference';
import { createViewport, updateViewport, renderCanvas, type Viewport } from './canvas';

const KIND_LABEL: Record<TrajectoryView['kind'], string> = {
  initial: 'init',
  'restart-fresh': 'fresh',
  'restart-mutant': 'mutant',
};

export interface TrajStripState {
  views: Map<number, Viewport>; // per-cell fixed viewport, keyed by stable id (REFERENCE_ID = −1 for the reference)
  drawnSteps: Map<number, number>; // last step count drawn per id (skip repaint of frozen endpoints + the reference)
}

export function createTrajStripState(): TrajStripState {
  return { views: new Map(), drawnSteps: new Map() };
}

function buildCells(
  root: HTMLElement,
  trajs: readonly TrajectoryView[],
  reference: ReferenceView | null,
): void {
  const refCell = reference
    ? `<div class="refcell" data-id="${REFERENCE_ID}" title="reference: a hand-built bar chart of this dataset, scored under the live objective — click to inspect its breakdown">
      <canvas class="trajcanvas"></canvas>
      <div class="trajmeta">
        <span class="tscore" data-t="score"></span>
        <span class="rbadge" data-t="ref">bars</span>
      </div>
    </div>`
    : '';
  root.innerHTML =
    refCell +
    trajs
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

/** Paint one cell's canvas through its own fixed viewport, skipping unchanged figures. */
function paintCell(
  el: HTMLElement,
  id: number,
  figure: TrajectoryView['figure'],
  steps: number,
  state: TrajStripState,
): void {
  if (!state.views.has(id)) state.views.set(id, createViewport());
  const view = state.views.get(id)!;
  // Repaint only when the cell advanced (or was never drawn): endpoints + the reference stay frozen.
  if (state.drawnSteps.get(id) !== steps) {
    updateViewport(view, figure);
    renderCanvas(el.querySelector('.trajcanvas') as HTMLCanvasElement, figure, view, {
      pad: 5,
      lineWidth: 1.5,
    });
    state.drawnSteps.set(id, steps);
  }
}

export function renderTrajStrip(
  root: HTMLElement,
  trajs: readonly TrajectoryView[],
  state: TrajStripState,
  selectedId: number,
  reference: ReferenceView | null = null,
): void {
  // The gallery only ever APPENDS (ids are stable, creation-ordered; the reference cell is fixed
  // for the whole session): rebuild on count change.
  const offset = reference ? 1 : 0;
  if (root.childElementCount !== trajs.length + offset) {
    buildCells(root, trajs, reference);
    state.drawnSteps.clear(); // canvases are blank after a rebuild — repaint everything once
  }
  // ★ best marker: TRAJECTORIES ONLY — the reference is a benchmark, never a competitor.
  let bestId = REFERENCE_ID; // matches no trajectory when every total is non-finite
  let bestScore = -Infinity;
  for (const t of trajs) {
    if (Number.isFinite(t.exactTotal) && t.exactTotal > bestScore) {
      bestScore = t.exactTotal;
      bestId = t.id;
    }
  }
  if (reference) {
    const el = root.children[0] as HTMLElement;
    paintCell(el, REFERENCE_ID, reference.figure, 0, state); // steps pinned at 0: it never advances
    el.classList.toggle('selected', selectedId === REFERENCE_ID);
    (el.querySelector('[data-t="score"]') as HTMLElement).textContent =
      reference.breakdown.total.toFixed(3);
  }
  for (let i = 0; i < trajs.length; i++) {
    const t = trajs[i]!;
    const el = root.children[i + offset] as HTMLElement;
    paintCell(el, t.id, t.figure, t.steps, state);
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
