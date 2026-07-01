// src/optim/session.ts
//
// The orchestrator: seed → init → step → convergence → result (ARCHITECTURE.md §optim). Composes the
// Adam stepper, the evolution layer, the plateau detector, and the score. The GUI drives step() from
// requestAnimationFrame; bench drives it in a headless loop. One step() = one inner optimizer step
// (Adam over every member + periodic evolve generation + a convergence probe on the best score).

import { config, type Config } from '../config';
import type { DataSet } from '../core/data';
import { seedToDataSet } from '../core/data';
import type { Figure } from '../core/figure';
import { cloneFigure } from '../core/figure';
import { pageFromConfig, frameFromConfig } from '../core/frame';
import { scoreExact, type Breakdown } from '../core/score';
import { gradScore, scoreOnly } from '../core/gradient';
import { adamStep, initAdam } from './gd';
import {
  initPopulation,
  evolveStep,
  bestExplorer,
  type Population,
  type Member,
} from './evolve';
import { initConvergence, pushScore, type ConvergenceState } from './converge';
import type { Rng } from '../core/rng';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'converged';

export interface SessionResult {
  figureSeed: number;
  dataSeed: number;
  figure: Figure; // best member's final figure
  data: DataSet;
  topCarriers: Record<string, string>; // best-matching measurement per data relation (informational)
  score: Breakdown; // exact breakdown of the final figure
  converged: boolean;
  convergedByCap: boolean; // hit maxSteps rather than a genuine plateau
  steps: number;
  configSnapshot: Config;
}

export class Session {
  readonly figureSeed: number;
  readonly dataSeed: number;
  readonly data: DataSet;
  readonly cfg: Config;

  status: SessionStatus = 'idle';
  steps = 0;

  private pop: Population;
  private rng: Rng;
  private conv: ConvergenceState;
  private best: Member;
  private readonly frame: ReturnType<typeof frameFromConfig>;
  private readonly page: ReturnType<typeof pageFromConfig>;

  constructor(figureSeed: number, dataSeed: number, cfg: Config = config) {
    this.figureSeed = figureSeed;
    this.dataSeed = dataSeed;
    this.cfg = cfg;
    this.data = seedToDataSet(dataSeed, cfg);
    this.frame = frameFromConfig(cfg);
    this.page = pageFromConfig(cfg);
    const init = initPopulation(figureSeed, cfg.evolve.populationSize, cfg);
    this.pop = init.pop;
    this.rng = init.rng;
    this.conv = initConvergence();
    this.best = this.pop.members[0]!;
  }

  /** Best member's current figure (what the canvas renders). */
  get figure(): Figure {
    return this.best.figure;
  }

  /** Best member's differentiable score (the convergence signal). */
  get bestScore(): number {
    return this.best.score;
  }

  /** Exact score breakdown of the best figure (for the score panel). Computed on demand. */
  breakdown(): Breakdown {
    return scoreExact(this.best.figure, this.data, this.cfg, this.frame, this.page);
  }

  /** The current annealed temperature (large early → config.T late), for global ordinal sorting. */
  temperature(): number {
    const a = this.cfg.anneal;
    if (!a || !a.enabled) return this.cfg.T;
    return this.cfg.T + (a.tStart - this.cfg.T) * Math.exp(-this.steps / a.tau);
  }

  /** Config with the current annealed temperature substituted. */
  private stepConfig(): Config {
    const a = this.cfg.anneal;
    if (!a || !a.enabled) return this.cfg;
    return { ...this.cfg, T: this.temperature() };
  }

  /** One inner optimizer step. No-op once converged. */
  step(): void {
    if (this.status === 'converged') return;
    this.status = 'running';
    const stepCfg = this.stepConfig();
    for (const m of this.pop.members) {
      const gs = gradScore(m.figure, this.data, stepCfg, this.frame, this.page);
      m.figure = adamStep(m.figure, gs.grad, m.adam, stepCfg.adam);
      m.score = gs.score;
    }
    this.steps += 1;
    if (this.steps % this.cfg.evolve.outerEvery === 0) {
      const ecfg = this.stepConfig();
      evolveStep(
        this.pop,
        (f) => scoreOnly(f, this.data, ecfg, this.frame, this.page),
        this.rng,
        this.cfg,
      );
      // Champion adoption: only when an explorer DECISIVELY beats the displayed champion (member 0).
      // This is the sole source of a visible display jump — a genuine breakthrough, not member-flicker.
      const explorer = bestExplorer(this.pop);
      const champ = this.pop.members[0]!;
      const fin = (x: number): number => (Number.isFinite(x) ? x : -Infinity);
      if (explorer && fin(explorer.score) > fin(champ.score) + this.cfg.evolve.adoptMargin) {
        this.pop.members[0] = {
          figure: cloneFigure(explorer.figure),
          adam: initAdam(),
          score: explorer.score,
        };
      }
    }
    this.best = this.pop.members[0]!; // the displayed champion (a smooth trajectory)
    if (pushScore(this.conv, this.best.score, this.cfg.converge)) {
      this.status = 'converged';
    }
  }

  /** Run inner steps until converged or `maxBatch` steps elapse (used by bench / non-animated runs). */
  run(maxBatch = Infinity): void {
    let n = 0;
    while (this.status !== 'converged' && n < maxBatch) {
      this.step();
      n += 1;
    }
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  reset(): void {
    const init = initPopulation(this.figureSeed, this.cfg.evolve.populationSize, this.cfg);
    this.pop = init.pop;
    this.rng = init.rng;
    this.conv = initConvergence();
    this.best = this.pop.members[0]!;
    this.steps = 0;
    this.status = 'idle';
  }

  result(): SessionResult {
    const b = this.breakdown();
    const topCarriers: Record<string, string> = {};
    for (const rel of b.relations) topCarriers[rel.key] = rel.measurements[0]?.id ?? '';
    return {
      figureSeed: this.figureSeed,
      dataSeed: this.dataSeed,
      figure: cloneFigure(this.best.figure),
      data: this.data,
      topCarriers,
      score: b,
      converged: this.conv.converged,
      convergedByCap: this.conv.byCap,
      steps: this.steps,
      configSnapshot: JSON.parse(JSON.stringify(this.cfg)) as Config,
    };
  }
}

export function createSession(figureSeed: number, dataSeed: number, cfg: Config = config): Session {
  return new Session(figureSeed, dataSeed, cfg);
}
