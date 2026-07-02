// src/ui/sessionApi.ts
//
// The SESSION API CONTRACT between the optimizer (implements) and the UI (consumes), fixed by the
// scoring-v2 build plan (handoffs/2026-07-01-scoring-v2-design.md §Optimizer v2) and extended by
// the sticky-selection/gallery pass. The UI is written against THIS interface only;
// `src/optim/session.ts` satisfies it structurally.
//
// Contract:
//   • step(): advances every ACTIVE trajectory by one inner step each (finished slots skipped).
//   • trajectories(): TrajectoryView[] — one view per live population slot.
//   • allTrajectories(): TrajectoryView[] — EVERY trajectory ever started this session, in
//     creation (id) order: frozen endpoints included. Entries never disappear or reorder; the
//     gallery renders this.
//   • TrajectoryView.id is a STABLE identity (never reused when a slot is recycled). The UI's
//     selection keys on id, so it survives overtakes, finishes, and slot restarts.
//   • detail(id): figure + exact Breakdown for ONE trajectory (live or endpoint) — the display
//     path for the user's sticky selection (main canvas + score panel). Null only for unknown ids.
//   • best(): best-by-exactTotal across finished endpoints and live trajectories (headless /
//     gallery "best" marker semantics — NOT the display path).
//   • breakdown(): Breakdown of best().
//   • status: 'running' | 'done' (done ⇔ all slots finished AND restart budget exhausted, or global cap).
//   • setMaxSteps(n): live-adjustable per-trajectory step cap; raising it un-caps 'capped'
//     trajectories if the restart budget hasn't retired them; lowering it caps running trajectories
//     at their next step. Initial value: config.converge.maxSteps.
//   • result(id?): with an id, carries THAT trajectory's figure/score (Save saves the selection);
//     without one, falls back to best() (bench/accept).

import type { Figure } from '../core/figure';
import type { Breakdown } from '../core/score';
import type { SessionResult } from '../optim/session';

export type TrajectoryStatus = 'running' | 'plateaued' | 'capped';
export type TrajectoryKind = 'initial' | 'restart-fresh' | 'restart-mutant';

/** One trajectory (live slot occupant or frozen endpoint). */
export interface TrajectoryView {
  id: number; // stable identity — never reused within a session
  slot: number;
  figure: Figure;
  exactTotal: number;
  status: TrajectoryStatus;
  steps: number;
  kind: TrajectoryKind;
}

export interface BestView {
  figure: Figure;
  breakdown: Breakdown;
}

export type SessionStatus = 'running' | 'done';

export interface SessionApi {
  readonly status: SessionStatus;
  step(): void;
  trajectories(): TrajectoryView[];
  allTrajectories(): TrajectoryView[];
  detail(id: number): BestView | null;
  best(): BestView;
  breakdown(): Breakdown;
  setMaxSteps(n: number): void;
  result(id?: number): SessionResult;
}

/** How the app obtains a session (injectable so UI tests run against a contract fake). */
export type SessionFactory = (figureSeed: number, dataSeed: number) => SessionApi;
