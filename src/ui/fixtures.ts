// src/ui/fixtures.ts
//
// A deterministic FAKE session implementing the v2 Session API contract (./sessionApi) exactly, so
// UI tests exercise the real contract surface without depending on the optimizer's internals (which
// are rebuilt in a parallel pass). Behavior is the contract's, minimally: step() advances every
// active trajectory; trajectories cap at maxSteps; raising the cap un-caps; status flips to 'done'
// when every slot is finished. Figures are static seed figures (the UI doesn't care that they don't
// improve). No Math.random anywhere — fully deterministic from the seeds.

import { config } from '../config';
import { seedToDataSet } from '../core/data';
import { seedToFigure, cloneFigure } from '../core/figure';
import { scoreExact } from '../core/score';
import type { SessionResult } from '../optim/session';
import type { SessionApi, SessionStatus, TrajectoryView, TrajectoryStatus } from './sessionApi';

export interface FakeSessionOptions {
  slots?: number;
  /** Trajectories plateau (converge) at this step count; those beyond run to the cap. */
  plateauAt?: number[];
}

export interface FakeSession extends SessionApi {
  /** Test spy: every value passed to setMaxSteps, in order. */
  readonly setMaxStepsCalls: number[];
  readonly figureSeed: number;
  readonly dataSeed: number;
  maxSteps: number;
  status: SessionStatus; // mutable here (the fake flips it); readonly through SessionApi
}

export function makeFakeSession(
  figureSeed: number,
  dataSeed: number,
  opts: FakeSessionOptions = {},
): FakeSession {
  const slots = opts.slots ?? 3;
  const plateauAt = opts.plateauAt ?? [];
  const data = seedToDataSet(dataSeed);
  const figures = Array.from({ length: slots }, (_, i) => seedToFigure(figureSeed + i));
  const steps = new Array<number>(slots).fill(0);
  const breakdowns = figures.map((f) => scoreExact(f, data));

  const self: FakeSession = {
    setMaxStepsCalls: [],
    figureSeed,
    dataSeed,
    maxSteps: config.converge.maxSteps,
    status: 'running',

    step(): void {
      if (this.status === 'done') return;
      for (let i = 0; i < slots; i++) {
        if (statusOf(i) === 'running') steps[i] = steps[i]! + 1;
      }
      refresh();
    },

    trajectories(): TrajectoryView[] {
      return figures.map((f, i) => ({
        slot: i,
        figure: f,
        exactTotal: breakdowns[i]!.total,
        status: statusOf(i),
        steps: steps[i]!,
        kind: i === 0 ? 'initial' : i % 2 === 1 ? 'restart-fresh' : 'restart-mutant',
      }));
    },

    best() {
      let bi = 0;
      for (let i = 1; i < slots; i++) if (breakdowns[i]!.total > breakdowns[bi]!.total) bi = i;
      return { figure: figures[bi]!, breakdown: breakdowns[bi]! };
    },

    breakdown() {
      return this.best().breakdown;
    },

    setMaxSteps(n: number): void {
      this.setMaxStepsCalls.push(n);
      this.maxSteps = n;
      refresh(); // raising un-caps, lowering caps — recompute 'done'
    },

    result(): SessionResult {
      const b = this.best();
      const topCarriers: Record<string, string> = {};
      for (const rel of b.breakdown.relations) topCarriers[rel.key] = rel.carriers[0]?.id ?? '';
      return {
        figureSeed,
        dataSeed,
        figure: cloneFigure(b.figure),
        data,
        topCarriers,
        score: b.breakdown,
        converged: true,
        convergedByCap: false,
        steps: Math.max(...steps),
        configSnapshot: JSON.parse(JSON.stringify(config)) as typeof config,
      };
    },
  };

  function statusOf(i: number): TrajectoryStatus {
    const p = plateauAt[i];
    if (p !== undefined && steps[i]! >= p) return 'plateaued';
    if (steps[i]! >= self.maxSteps) return 'capped';
    return 'running';
  }

  function refresh(): void {
    const anyRunning = figures.some((_, i) => statusOf(i) === 'running');
    self.status = anyRunning ? 'running' : 'done';
  }

  return self;
}
