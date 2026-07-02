// src/ui/sessionApi.ts
//
// The SESSION API CONTRACT between the optimizer (implements) and the UI (consumes), fixed by the
// scoring-v2 build plan (handoffs/2026-07-01-scoring-v2-design.md §Optimizer v2). The UI is written
// against THIS interface only. `src/optim/session.ts` (rebuilt in a parallel pass) must satisfy it
// structurally; at integration the cast in app.ts becomes a pure widening (or this file re-exports
// the optimizer's own types).
//
// Contract (verbatim from the build plan):
//   • step(): advances every ACTIVE trajectory by one inner step each (finished slots skipped).
//   • trajectories(): TrajectoryView[] — one view per population slot.
//   • best(): best-by-exactTotal across finished endpoints and live trajectories.
//   • breakdown(): Breakdown of best().
//   • status: 'running' | 'done' (done ⇔ all slots finished AND restart budget exhausted, or global cap).
//   • setMaxSteps(n): live-adjustable per-trajectory step cap; raising it un-caps 'capped'
//     trajectories if the restart budget hasn't retired them; lowering it caps running trajectories
//     at their next step. Initial value: config.converge.maxSteps.
//   • result()/save uses best().

import type { Figure } from '../core/figure';
import type { Breakdown } from '../core/score';
import type { SessionResult } from '../optim/session';

export type TrajectoryStatus = 'running' | 'plateaued' | 'capped';
export type TrajectoryKind = 'initial' | 'restart-fresh' | 'restart-mutant';

/** One population slot's currently-playing (or frozen) trajectory. */
export interface TrajectoryView {
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
  best(): BestView;
  breakdown(): Breakdown;
  setMaxSteps(n: number): void;
  result(): SessionResult;
}

/** How the app obtains a session (injectable so UI tests run against a contract fake). */
export type SessionFactory = (figureSeed: number, dataSeed: number) => SessionApi;
