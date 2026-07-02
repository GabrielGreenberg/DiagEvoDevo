// src/optim/session.ts
//
// The orchestrator (optimizer v2, ARCHITECTURE.md §optim; "let each evolution play out"):
// populationSize INDEPENDENT multi-start trajectories. Each trajectory owns its Adam state, its
// anneal clock (T decays with the trajectory's OWN step count, so every replacement re-anneals
// from tStart), and its plateau detector. There is NO champion adoption and NO mid-run culling:
// a trajectory that plateaus — or hits the live per-trajectory step cap (setMaxSteps) — is FROZEN
// as an endpoint; its freed slot starts a replacement (deterministically alternating fresh-random /
// mutation-of-best-endpoint per evolve.mutateFraction) until evolve.maxRestarts replacements have
// been spent. The session result is the best endpoint by EXACT score. The GUI drives step() from
// requestAnimationFrame and renders every slot (trajectory strip) plus best(); bench/accept drive
// run() headless.

import { config, type Config } from '../config';
import type { DataSet } from '../core/data';
import { seedToDataSet } from '../core/data';
import type { Figure } from '../core/figure';
import { cloneFigure } from '../core/figure';
import { pageFromConfig, frameFromConfig } from '../core/frame';
import { scoreExact, type Breakdown } from '../core/score';
import { gradScore } from '../core/gradient';
import { adamStep, initAdam, type AdamState } from './gd';
import { randomFigure, mutateFigure, populationRng, initialFigures, isMutantRestart } from './evolve';
import { initConvergence, pushScore, type ConvergenceState } from './converge';
import type { Rng } from '../core/rng';

/** v2 session status. done ⇔ (all slots finished AND the restart budget is exhausted) or the
 *  global step cap (converge.maxTotalSteps) was hit. */
export type SessionStatus = 'running' | 'done';

export type TrajectoryStatus = 'running' | 'plateaued' | 'capped';
export type TrajectoryKind = 'initial' | 'restart-fresh' | 'restart-mutant';

/** One slot's current trajectory, as the UI sees it (thumbnail strip). */
export interface TrajectoryView {
  slot: number;
  figure: Figure;
  exactTotal: number; // exact (non-annealed) score S of the current figure
  status: TrajectoryStatus;
  steps: number; // the trajectory's OWN step count (= its anneal clock)
  kind: TrajectoryKind;
}

interface Trajectory {
  slot: number;
  kind: TrajectoryKind;
  figure: Figure;
  adam: AdamState;
  conv: ConvergenceState;
  steps: number; // own step count — also the anneal clock (starts at 0 for every replacement)
  status: TrajectoryStatus;
  exact: { atSteps: number; breakdown: Breakdown } | null; // lazy exact-score cache
}

export interface SessionResult {
  figureSeed: number;
  dataSeed: number;
  figure: Figure; // best endpoint's figure
  data: DataSet;
  topCarriers: Record<string, string>; // best-matching carrier per data relation (informational)
  score: Breakdown; // exact breakdown of the best figure
  converged: boolean; // session ran to 'done'
  convergedByCap: boolean; // the best trajectory was frozen by the step cap, not a genuine plateau
  steps: number; // session step() calls
  configSnapshot: Config;
}

export class Session {
  readonly figureSeed: number;
  readonly dataSeed: number;
  readonly data: DataSet;
  readonly cfg: Config;

  /** Session step() calls so far (each advances every ACTIVE trajectory by one inner step). */
  steps = 0;

  private slots: Trajectory[];
  private endpoints: Trajectory[] = []; // retired (replaced) trajectories, frozen forever
  private restartsUsed = 0;
  private maxStepsLive: number; // live-adjustable per-trajectory cap (setMaxSteps)
  private rng: Rng;
  private readonly frame: ReturnType<typeof frameFromConfig>;
  private readonly page: ReturnType<typeof pageFromConfig>;

  constructor(figureSeed: number, dataSeed: number, cfg: Config = config) {
    this.figureSeed = figureSeed;
    this.dataSeed = dataSeed;
    this.cfg = cfg;
    this.data = seedToDataSet(dataSeed, cfg);
    this.frame = frameFromConfig(cfg);
    this.page = pageFromConfig(cfg);
    this.rng = populationRng(figureSeed);
    this.maxStepsLive = cfg.converge.maxSteps;
    this.slots = initialFigures(figureSeed, cfg.evolve.populationSize, this.rng, cfg).map((f, k) =>
      newTrajectory(k, 'initial', f),
    );
  }

  /** done ⇔ all slots finished AND restart budget exhausted, or the global step cap was hit. */
  get status(): SessionStatus {
    if (this.steps >= this.cfg.converge.maxTotalSteps) return 'done';
    if (
      this.restartsUsed >= this.cfg.evolve.maxRestarts &&
      this.slots.every((t) => t.status !== 'running')
    ) {
      return 'done';
    }
    return 'running';
  }

  /** The live per-trajectory step cap (initially config.converge.maxSteps). */
  get maxSteps(): number {
    return this.maxStepsLive;
  }

  /**
   * Live-adjust the per-trajectory step cap (GUI control). Raising it un-caps 'capped'
   * trajectories still occupying their slot (the restart budget hasn't retired them); lowering it
   * caps running trajectories at their next step (via the plateau detector's cap check).
   */
  setMaxSteps(n: number): void {
    this.maxStepsLive = Math.max(1, Math.trunc(n));
    if (this.steps >= this.cfg.converge.maxTotalSteps) return; // globally capped stays done
    for (const t of this.slots) {
      if (t.status === 'capped' && t.steps < this.maxStepsLive) {
        t.status = 'running';
        t.conv.converged = false;
        t.conv.byCap = false;
      }
    }
  }

  /** One session step: replace retired slots, then advance every ACTIVE trajectory by one inner
   *  Adam step on its OWN anneal clock. No-op once done. */
  step(): void {
    if (this.status === 'done') return;

    // 1. Replacement pass: retire finished occupants and start replacements while budget lasts.
    //    (Runs at the START of the step so a just-capped trajectory is visible for one tick and
    //    can still be rescued by setMaxSteps before the budget retires it.)
    for (const t of [...this.slots]) {
      if (t.status === 'running') continue;
      if (this.restartsUsed >= this.cfg.evolve.maxRestarts) continue;
      this.endpoints.push(t); // frozen forever
      const mutant = isMutantRestart(this.restartsUsed, this.cfg.evolve.mutateFraction);
      this.restartsUsed += 1;
      let fig: Figure;
      let kind: TrajectoryKind;
      const parent = mutant ? this.bestOf(this.endpoints) : null;
      if (parent) {
        const sigmaAbs =
          this.cfg.evolve.mutationSigma * (this.cfg.figureInit.max - this.cfg.figureInit.min);
        fig = mutateFigure(parent.figure, sigmaAbs, this.rng);
        kind = 'restart-mutant';
      } else {
        fig = randomFigure(this.rng, this.cfg);
        kind = 'restart-fresh';
      }
      this.slots[t.slot] = newTrajectory(t.slot, kind, fig);
    }

    // 2. Advance every ACTIVE trajectory by one inner step; finished slots are skipped.
    const convCfg = { ...this.cfg.converge, maxSteps: this.maxStepsLive };
    for (const t of this.slots) {
      if (t.status !== 'running') continue;
      const stepCfg = this.annealCfg(t.steps);
      const gs = gradScore(t.figure, this.data, stepCfg, this.frame, this.page);
      t.figure = adamStep(t.figure, gs.grad, t.adam, stepCfg.adam);
      t.steps += 1;
      t.exact = null;
      if (pushScore(t.conv, gs.score, convCfg)) {
        t.status = t.conv.byCap ? 'capped' : 'plateaued';
      }
    }
    this.steps += 1;

    // 3. Global cap: force-finish everything still running (status flips to 'done').
    if (this.steps >= this.cfg.converge.maxTotalSteps) {
      for (const t of this.slots) {
        if (t.status !== 'running') continue;
        t.status = 'capped';
        t.conv.converged = true;
        t.conv.byCap = true;
      }
    }
  }

  /** Every slot's current trajectory (the UI's thumbnail strip). */
  trajectories(): TrajectoryView[] {
    return this.slots.map((t) => ({
      slot: t.slot,
      figure: t.figure,
      exactTotal: this.exactOf(t).total,
      status: t.status,
      steps: t.steps,
      kind: t.kind,
    }));
  }

  /** Best figure by EXACT total across finished endpoints and live trajectories. */
  best(): { figure: Figure; breakdown: Breakdown } {
    const t = this.bestTrajectory();
    return { figure: t.figure, breakdown: this.exactOf(t) };
  }

  /** Exact score breakdown of best() (for the score panel). Cached per trajectory step. */
  breakdown(): Breakdown {
    return this.exactOf(this.bestTrajectory());
  }

  /** Run steps until done or `maxBatch` steps elapse (used by bench / non-animated runs). */
  run(maxBatch = Infinity): void {
    let n = 0;
    while (this.status !== 'done' && n < maxBatch) {
      this.step();
      n += 1;
    }
  }

  result(): SessionResult {
    const t = this.bestTrajectory();
    const b = this.exactOf(t);
    const topCarriers: Record<string, string> = {};
    for (const rel of b.relations) topCarriers[rel.key] = rel.carriers[0]?.id ?? '';
    return {
      figureSeed: this.figureSeed,
      dataSeed: this.dataSeed,
      figure: cloneFigure(t.figure),
      data: this.data,
      topCarriers,
      score: b,
      converged: this.status === 'done',
      convergedByCap: t.status === 'capped',
      steps: this.steps,
      configSnapshot: JSON.parse(JSON.stringify(this.cfg)) as Config,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Exact breakdown of a trajectory's current figure, cached against its own step count.
   *  (Endpoints never step again, so each is scored exactly once.) */
  private exactOf(t: Trajectory): Breakdown {
    if (!t.exact || t.exact.atSteps !== t.steps) {
      t.exact = {
        atSteps: t.steps,
        breakdown: scoreExact(t.figure, this.data, this.cfg, this.frame, this.page),
      };
    }
    return t.exact.breakdown;
  }

  /** Highest exact total among `pool` (first wins ties — deterministic). */
  private bestOf(pool: readonly Trajectory[]): Trajectory | null {
    let best: Trajectory | null = null;
    let bestTotal = -Infinity;
    for (const t of pool) {
      const raw = this.exactOf(t).total;
      const total = Number.isFinite(raw) ? raw : -Infinity;
      if (!best || total > bestTotal) {
        best = t;
        bestTotal = total;
      }
    }
    return best;
  }

  /** Best across finished endpoints AND live trajectories (slots is never empty). */
  private bestTrajectory(): Trajectory {
    return this.bestOf([...this.endpoints, ...this.slots])!;
  }

  /** The anneal schedule on a trajectory's OWN clock: T(k) = T + (tStart−T)·e^(−k/τ). */
  private annealT(k: number): number {
    const a = this.cfg.anneal;
    if (!a || !a.enabled) return this.cfg.T;
    return this.cfg.T + (a.tStart - this.cfg.T) * Math.exp(-k / a.tau);
  }

  /** Config with a trajectory's current annealed temperature substituted. */
  private annealCfg(k: number): Config {
    const a = this.cfg.anneal;
    if (!a || !a.enabled) return this.cfg;
    return { ...this.cfg, T: this.annealT(k) };
  }
}

function newTrajectory(slot: number, kind: TrajectoryKind, figure: Figure): Trajectory {
  return {
    slot,
    kind,
    figure,
    adam: initAdam(),
    conv: initConvergence(),
    steps: 0,
    status: 'running',
    exact: null,
  };
}

export function createSession(figureSeed: number, dataSeed: number, cfg: Config = config): Session {
  return new Session(figureSeed, dataSeed, cfg);
}
