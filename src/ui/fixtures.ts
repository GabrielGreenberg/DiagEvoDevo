// src/ui/fixtures.ts
//
// A deterministic FAKE session implementing the Session API contract (./sessionApi) exactly, so UI
// tests exercise the real contract surface without depending on the optimizer's internals. Behavior
// is the contract's, minimally: step() advances every active trajectory; trajectories cap at
// maxSteps or plateau at plateauAt[id]; finished slot occupants retire to frozen ENDPOINTS and are
// replaced (alternating fresh/mutant) while the maxRestarts budget lasts; ids are stable and never
// reused; status flips to 'done' when every slot is finished and the budget is spent. Figures are
// static seed figures (the UI doesn't care that they don't improve). `forceTotal(id, x)` lets an
// adversarial test stage a leadership overtake without touching real scoring. No Math.random
// anywhere — fully deterministic from the seeds.

import { config } from '../config';
import { seedToDataSet } from '../core/data';
import { seedToFigure, cloneFigure, type Figure } from '../core/figure';
import { scoreExact, type Breakdown } from '../core/score';
import type { SessionResult } from '../optim/session';
import type {
  SessionApi,
  SessionStatus,
  TrajectoryView,
  TrajectoryStatus,
  TrajectoryKind,
  BestView,
} from './sessionApi';

export interface FakeSessionOptions {
  slots?: number;
  /** Trajectory ID i plateaus (converges) once ITS OWN steps reach plateauAt[i]; others run to the cap. */
  plateauAt?: (number | undefined)[];
  /** Replacement budget (default 0): finished slot occupants retire and are replaced, like the real session. */
  maxRestarts?: number;
}

export interface FakeSession extends SessionApi {
  /** Test spy: every value passed to setMaxSteps, in order. */
  readonly setMaxStepsCalls: number[];
  readonly figureSeed: number;
  readonly dataSeed: number;
  maxSteps: number;
  status: SessionStatus; // mutable here (the fake flips it); readonly through SessionApi
  /** Adversarial control: override a trajectory's exact total (simulates an overtake). */
  forceTotal(id: number, total: number): void;
}

interface Rec {
  id: number;
  slot: number;
  figure: Figure;
  breakdown: Breakdown;
  steps: number;
  kind: TrajectoryKind;
  frozen: TrajectoryStatus | null; // set at retirement; frozen endpoints never change again
  forcedTotal: number | null;
}

export function makeFakeSession(
  figureSeed: number,
  dataSeed: number,
  opts: FakeSessionOptions = {},
): FakeSession {
  const nSlots = opts.slots ?? 3;
  const plateauAt = opts.plateauAt ?? [];
  const maxRestarts = opts.maxRestarts ?? 0;
  const data = seedToDataSet(dataSeed);

  let nextId = 0;
  let restartsUsed = 0;
  let sessionSteps = 0;
  const endpoints: Rec[] = [];

  function makeRec(slot: number, kind: TrajectoryKind): Rec {
    const id = nextId++;
    const figure = seedToFigure(figureSeed + id);
    return {
      id,
      slot,
      figure,
      breakdown: scoreExact(figure, data),
      steps: 0,
      kind,
      frozen: null,
      forcedTotal: null,
    };
  }
  const slots: Rec[] = Array.from({ length: nSlots }, (_, k) => makeRec(k, 'initial'));

  const statusOf = (r: Rec): TrajectoryStatus => {
    if (r.frozen) return r.frozen;
    const p = plateauAt[r.id];
    if (p !== undefined && r.steps >= p) return 'plateaued';
    if (r.steps >= self.maxSteps) return 'capped';
    return 'running';
  };
  const effTotal = (r: Rec): number => r.forcedTotal ?? r.breakdown.total;
  const effBreakdown = (r: Rec): Breakdown =>
    r.forcedTotal === null ? r.breakdown : { ...r.breakdown, total: r.forcedTotal };
  const view = (r: Rec): TrajectoryView => ({
    id: r.id,
    slot: r.slot,
    figure: r.figure,
    exactTotal: effTotal(r),
    status: statusOf(r),
    steps: r.steps,
    kind: r.kind,
  });
  const allRecs = (): Rec[] => [...endpoints, ...slots].sort((a, b) => a.id - b.id);
  const byId = (id: number): Rec | null => allRecs().find((r) => r.id === id) ?? null;
  const bestRec = (): Rec =>
    allRecs().reduce((b, r) => (effTotal(r) > effTotal(b) ? r : b));

  // done ⇔ every slot occupant is finished AND the restart budget is exhausted (contract).
  function refresh(): void {
    const anyRunning = slots.some((r) => statusOf(r) === 'running');
    self.status = !anyRunning && restartsUsed >= maxRestarts ? 'done' : 'running';
  }

  const self: FakeSession = {
    setMaxStepsCalls: [],
    figureSeed,
    dataSeed,
    maxSteps: config.converge.maxSteps,
    status: 'running',

    step(): void {
      if (this.status === 'done') return;
      sessionSteps += 1;
      // retirement pass first (mirrors the real session): finished occupants freeze as endpoints
      for (const r of [...slots]) {
        if (statusOf(r) === 'running' || restartsUsed >= maxRestarts) continue;
        r.frozen = statusOf(r);
        endpoints.push(r);
        const kind: TrajectoryKind = restartsUsed % 2 === 0 ? 'restart-fresh' : 'restart-mutant';
        restartsUsed += 1;
        slots[r.slot] = makeRec(r.slot, kind);
      }
      for (const r of slots) if (statusOf(r) === 'running') r.steps += 1;
      refresh();
    },

    trajectories(): TrajectoryView[] {
      return slots.map(view);
    },

    allTrajectories(): TrajectoryView[] {
      return allRecs().map(view);
    },

    detail(id: number): BestView | null {
      const r = byId(id);
      return r ? { figure: r.figure, breakdown: effBreakdown(r) } : null;
    },

    best(): BestView {
      const r = bestRec();
      return { figure: r.figure, breakdown: effBreakdown(r) };
    },

    breakdown(): Breakdown {
      return this.best().breakdown;
    },

    setMaxSteps(n: number): void {
      this.setMaxStepsCalls.push(n);
      this.maxSteps = n;
      refresh(); // raising un-caps un-retired occupants, lowering caps — recompute 'done'
    },

    result(id?: number): SessionResult {
      const r = (id !== undefined ? byId(id) : null) ?? bestRec();
      const b = effBreakdown(r);
      const topCarriers: Record<string, string> = {};
      for (const rel of b.relations) topCarriers[rel.key] = rel.carriers[0]?.id ?? '';
      return {
        figureSeed,
        dataSeed,
        figure: cloneFigure(r.figure),
        data,
        topCarriers,
        score: b,
        converged: this.status === 'done',
        convergedByCap: statusOf(r) === 'capped',
        // real Session.result() reports TOTAL session step() calls, not the trajectory's own count
        steps: sessionSteps,
        configSnapshot: JSON.parse(JSON.stringify(config)) as typeof config,
      };
    },

    forceTotal(id: number, total: number): void {
      const r = byId(id);
      if (r) r.forcedTotal = total;
    },
  };

  return self;
}
