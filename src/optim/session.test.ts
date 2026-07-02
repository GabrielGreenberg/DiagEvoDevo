// src/optim/session.test.ts — v2 gate for the multi-start orchestrator (SESSION API CONTRACT).
//
// Adversarial targets, per the optimizer-v2 build plan:
//   • determinism from seeds (including through the replacement lifecycle),
//   • trajectory INDEPENDENCE: every slot is exactly reproducible by a standalone single-trajectory
//     replay from its own start point — so no trajectory can have inherited another's parameters,
//     Adam moments, or anneal clock mid-run (any adoption/culling/shared-state bug breaks the
//     bit-exact match),
//   • both replacement kinds occur at the shipped mutateFraction, the mutant's parent is the BEST
//     endpoint, and every replacement re-anneals from ITS OWN step 0,
//   • best() dominates every endpoint,
//   • setMaxSteps: live raise un-caps un-retired trajectories, live lower caps at the next step,
//   • a real short convergence run under the v2 score reaches DIVISION OF LABOR.

import { describe, it, expect } from 'vitest';
import { createSession, Session, type TrajectoryView } from './session';
import { initialFigures, randomFigure, mutateFigure, populationRng } from './evolve';
import { initAdam, adamStep } from './gd';
import { gradScore } from '../core/gradient';
import { seedToDataSet, type DataSet } from '../core/data';
import { frameFromConfig, pageFromConfig } from '../core/frame';
import { cloneFigure, type Figure } from '../core/figure';
import { config, type Config } from '../config';

// ── helpers ─────────────────────────────────────────────────────────────────────

const cfgWith = (over: {
  converge?: Partial<Config['converge']>;
  evolve?: Partial<Config['evolve']>;
}): Config => ({
  ...config,
  converge: { ...config.converge, ...over.converge },
  evolve: { ...config.evolve, ...over.evolve },
});

/** Standalone single-trajectory integrator implementing the contract semantics EXACTLY: fresh Adam
 *  state, anneal temperature from the trajectory's OWN clock k = 0..n−1. `clockOffset` exists only
 *  to prove the tests would CATCH a non-reset anneal clock. */
const replay = (start: Figure, n: number, data: DataSet, cfg: Config, clockOffset = 0): Figure => {
  const frame = frameFromConfig(cfg);
  const page = pageFromConfig(cfg);
  const adam = initAdam();
  let f = cloneFigure(start);
  for (let k = 0; k < n; k++) {
    const kk = k + clockOffset;
    const T = cfg.anneal.enabled
      ? cfg.T + (cfg.anneal.tStart - cfg.T) * Math.exp(-kk / cfg.anneal.tau)
      : cfg.T;
    const stepCfg = { ...cfg, T };
    const gs = gradScore(f, data, stepCfg, frame, page);
    f = adamStep(f, gs.grad, adam, stepCfg.adam);
  }
  return f;
};

const arr = (f: Figure): number[] => Array.from(f);

// A small deterministic lifecycle scenario: 2 slots, cap 25, budget 2 → the two initial
// trajectories cap at step 25, are retired at step 26 into one fresh + one mutant replacement,
// which cap at session step 50 with the budget exhausted (windowSize 80 ⇒ no plateau can fire).
const LC = {
  figureSeed: 7,
  dataSeed: 1,
  cfg: cfgWith({
    converge: { maxSteps: 25, minSteps: 10 },
    evolve: { populationSize: 2, maxRestarts: 2 },
  }),
};

interface LifecycleRun {
  s: Session;
  samples: TrajectoryView[][]; // trajectories() after every step
}

function runLifecycle(figureSeed = LC.figureSeed): LifecycleRun {
  const s = createSession(figureSeed, LC.dataSeed, LC.cfg);
  const samples: TrajectoryView[][] = [];
  while (s.status !== 'done' && samples.length < 300) {
    s.step();
    samples.push(s.trajectories());
  }
  expect(s.status).toBe('done');
  return { s, samples };
}

let lifecycleMemo: LifecycleRun | null = null;
const lifecycle = (): LifecycleRun => (lifecycleMemo ??= runLifecycle());

// ── determinism ─────────────────────────────────────────────────────────────────

describe('session: determinism from seeds (through the full replacement lifecycle)', () => {
  it('same seeds → identical sampled trajectories, endpoints, and best', { timeout: 60000 }, () => {
    const a = lifecycle();
    const b = runLifecycle();
    expect(b.samples.length).toBe(a.samples.length);
    for (let i = 0; i < a.samples.length; i++) {
      for (let k = 0; k < a.samples[i]!.length; k++) {
        const va = a.samples[i]![k]!;
        const vb = b.samples[i]![k]!;
        expect(vb.kind).toBe(va.kind);
        expect(vb.status).toBe(va.status);
        expect(vb.steps).toBe(va.steps);
        expect(arr(vb.figure)).toEqual(arr(va.figure));
        expect(vb.exactTotal).toBe(va.exactTotal);
      }
    }
    expect(arr(b.s.best().figure)).toEqual(arr(a.s.best().figure));
  });

  it('different figure seeds → different trajectories', { timeout: 60000 }, () => {
    const a = lifecycle();
    const b = runLifecycle(8);
    expect(arr(b.samples[0]![1]!.figure)).not.toEqual(arr(a.samples[0]![1]!.figure));
  });
});

// ── independence: the adversarial parameter fingerprint ─────────────────────────

describe('session: trajectories are INDEPENDENT (no adoption, no shared state)', () => {
  it(
    'every slot is bit-exactly reproduced by a standalone replay from its own start',
    { timeout: 60000 },
    () => {
      // Shipped config (population 4, cap 5000 ⇒ no replacement inside 30 steps).
      const N = 30;
      const s = createSession(3, 1);
      for (let i = 0; i < N; i++) s.step();
      const views = s.trajectories();
      expect(views).toHaveLength(config.evolve.populationSize);
      const starts = initialFigures(3, config.evolve.populationSize, populationRng(3));
      const data = seedToDataSet(1, config);
      for (let k = 0; k < views.length; k++) {
        const v = views[k]!;
        expect(v.slot).toBe(k);
        expect(v.kind).toBe('initial');
        expect(v.status).toBe('running');
        expect(v.steps).toBe(N);
        // Bit-exact: had slot k adopted/inherited ANY parameter, Adam moment, or anneal tick from
        // another trajectory, its integrated path would diverge from the isolated replay.
        expect(arr(v.figure)).toEqual(arr(replay(starts[k]!, N, data, config)));
      }
    },
  );

  it('slot step counters only ever advance by 1, freeze, or reset to 1 on a replacement', () => {
    const { samples } = lifecycle();
    for (let k = 0; k < LC.cfg.evolve.populationSize; k++) {
      let prev: TrajectoryView | null = null;
      for (const sample of samples) {
        const v = sample[k]!;
        if (prev) {
          const advanced = v.steps === prev.steps + 1 && v.kind === prev.kind;
          const frozen =
            prev.status !== 'running' && v.steps === prev.steps && v.kind === prev.kind;
          const replaced = prev.status !== 'running' && v.steps === 1 && v.kind !== 'initial';
          expect(advanced || frozen || replaced, `slot ${k}: ${prev.steps}→${v.steps}`).toBe(true);
        }
        prev = v;
      }
    }
  });
});

// ── the replacement lifecycle: kinds, mutant parent, per-trajectory anneal reset ─

describe('session: replacements (fresh/mutant), frozen endpoints, anneal reset', () => {
  it('trajectories cap as endpoints; both replacement kinds occur at the shipped mutateFraction', () => {
    const { samples } = lifecycle();
    // session step 25: both initial trajectories hit the cap and freeze
    const atCap = samples[24]!;
    for (const v of atCap) {
      expect(v.kind).toBe('initial');
      expect(v.status).toBe('capped');
      expect(v.steps).toBe(25);
    }
    // session step 26: both slots were retired and replaced — one fresh, one mutant (fraction 0.5)
    const afterReplace = samples[25]!;
    expect(afterReplace.map((v) => v.kind)).toEqual(['restart-fresh', 'restart-mutant']);
    for (const v of afterReplace) {
      expect(v.status).toBe('running');
      expect(v.steps).toBe(1); // spawned this step, advanced once — its OWN clock, not the session's
    }
    // and the whole session finished with the budget spent: 25 + 25 steps
    expect(samples.length).toBe(50);
  });

  it(
    'replacement starts come from the seeded Rng stream, the mutant parent is the BEST endpoint, ' +
      'and each replacement re-anneals from ITS OWN step 0',
    { timeout: 60000 },
    () => {
      const { samples } = lifecycle();
      const cfg = LC.cfg;
      const data = seedToDataSet(LC.dataSeed, cfg);
      // Reconstruct the outer Rng stream exactly as the session consumed it:
      const rng = populationRng(LC.figureSeed);
      initialFigures(LC.figureSeed, cfg.evolve.populationSize, rng, cfg); // burn the init draws
      const freshStart = randomFigure(rng, cfg); // replacement 0 (slot 0): fresh
      const atCap = samples[24]!;
      const parent = atCap.reduce((b, v) => (v.exactTotal > b.exactTotal ? v : b)); // best endpoint
      const sigmaAbs = cfg.evolve.mutationSigma * (cfg.figureInit.max - cfg.figureInit.min);
      const mutantStart = mutateFigure(parent.figure, sigmaAbs, rng); // replacement 1 (slot 1)
      const final = samples[samples.length - 1]!;
      // Bit-exact replay on the replacement's OWN anneal clock (k = 0..24). This fails if the
      // session (a) drew replacements from a different rng position, (b) mutated the wrong parent,
      // (c) reused stale Adam state, or (d) did not reset the anneal clock.
      expect(arr(final[0]!.figure)).toEqual(arr(replay(freshStart, 25, data, cfg)));
      expect(arr(final[1]!.figure)).toEqual(arr(replay(mutantStart, 25, data, cfg)));
      // Negative control: a NON-reset anneal clock (offset by the retired trajectory's 25 steps)
      // produces a different path — i.e. this test genuinely detects a shared clock.
      expect(arr(final[0]!.figure)).not.toEqual(arr(replay(freshStart, 25, data, cfg, 25)));
    },
  );

  it('best() dominates every endpoint and every live trajectory', () => {
    const { s, samples } = lifecycle();
    const best = s.best().breakdown.total;
    for (const sample of samples) {
      for (const v of sample) {
        if (v.status !== 'running') {
          expect(best).toBeGreaterThanOrEqual(v.exactTotal); // every frozen endpoint
        }
      }
    }
    for (const v of s.trajectories()) expect(best).toBeGreaterThanOrEqual(v.exactTotal);
    // and result()/save uses best()
    const r = s.result();
    expect(r.score.total).toBe(best);
    expect(r.converged).toBe(true);
  });
});

// ── setMaxSteps: the live per-trajectory cap ────────────────────────────────────

describe('session: setMaxSteps (live per-trajectory cap)', () => {
  const capCfg = cfgWith({
    converge: { maxSteps: 20, minSteps: 5 },
    evolve: { populationSize: 2, maxRestarts: 0 },
  });

  it('initial cap comes from config.converge.maxSteps', () => {
    const s = createSession(5, 1, capCfg);
    expect(s.maxSteps).toBe(20);
  });

  it('raising the cap un-caps capped trajectories and revives a done session', { timeout: 60000 }, () => {
    const s = createSession(5, 1, capCfg);
    s.run();
    expect(s.status).toBe('done'); // budget 0 + everything capped
    expect(s.steps).toBe(20);
    for (const v of s.trajectories()) expect(v.status).toBe('capped');
    s.setMaxSteps(30); // raise → un-cap (no restart budget ever retired them)
    expect(s.status).toBe('running');
    for (const v of s.trajectories()) expect(v.status).toBe('running');
    s.run();
    expect(s.status).toBe('done');
    for (const v of s.trajectories()) {
      expect(v.status).toBe('capped');
      expect(v.steps).toBe(30); // played on to the new cap
    }
  });

  it('raising the cap BEFORE the budget retires a capped trajectory resumes it in place', { timeout: 60000 }, () => {
    const cfg = cfgWith({
      converge: { maxSteps: 20, minSteps: 5 },
      evolve: { populationSize: 2, maxRestarts: 2 },
    });
    const s = createSession(5, 1, cfg);
    s.run(20); // exactly to the cap; retirement would happen on the NEXT step
    for (const v of s.trajectories()) expect(v.status).toBe('capped');
    expect(s.status).toBe('running'); // budget remains
    s.setMaxSteps(30);
    s.run(10);
    for (const v of s.trajectories()) {
      expect(v.kind).toBe('initial'); // NOT replaced — the same trajectories resumed
      expect(v.steps).toBe(30);
    }
  });

  it('lowering the cap caps running trajectories at their next step', { timeout: 60000 }, () => {
    const s = createSession(5, 1, capCfg);
    s.run(10);
    for (const v of s.trajectories()) expect(v.status).toBe('running');
    s.setMaxSteps(5); // below the 10 steps already taken
    s.step();
    for (const v of s.trajectories()) {
      expect(v.status).toBe('capped');
      expect(v.steps).toBe(11); // the one further step it was allowed
    }
    expect(s.status).toBe('done');
  });

  it('the global session cap (converge.maxTotalSteps) force-finishes everything', () => {
    const cfg = cfgWith({
      converge: { maxTotalSteps: 15 },
      evolve: { populationSize: 2 },
    });
    const s = createSession(5, 1, cfg);
    s.run();
    expect(s.steps).toBe(15);
    expect(s.status).toBe('done');
    for (const v of s.trajectories()) expect(v.status).toBe('capped');
    s.setMaxSteps(10000); // the per-trajectory cap cannot override the global cap
    expect(s.status).toBe('done');
  });
});

// ── the v2 convergence gate: division of labor on a real short run ──────────────

describe('session: a short real run under the v2 score reaches division of labor', () => {
  it(
    'order gets a salient τ_sym ≥ 0.9 carrier AND sales gets a salient ratio ≥ 0.9 carrier',
    async () => {
      // Calibrated by scratch/optimv2_probe.ts: seed 2 @ pop 2, cap 1500, no restarts reaches
      // ord 1.000 / ratio 0.999 in ~11s. Thresholds mirror scripts/accept.ts gate 5 (SALIENT 0.5,
      // RUNG_TARGET 0.9) — gate definitions from the design record, not scoring tunables.
      const SALIENT = 0.5;
      const cfg = cfgWith({
        converge: { maxSteps: 1500 },
        evolve: { populationSize: 2, maxRestarts: 0 },
      });
      const s = createSession(2, 1, cfg);
      // Run in batches, yielding to the event loop between them: a single synchronous multi-minute
      // run() starves the vitest worker's RPC channel ("Timeout calling onTaskUpdate" → exit 1
      // even with every test green). Same trajectory — step order and RNG are untouched.
      while (s.status !== 'done') {
        s.run(150);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const b = s.best().breakdown;
      const bestSalient = (key: 'sales' | 'order', rung: 'ord' | 'ratio'): number => {
        const rel = b.relations.find((r) => r.key === key)!;
        let best = 0;
        for (const c of rel.carriers) {
          if (c.salience < SALIENT) continue;
          const f =
            rung === 'ord' ? Math.abs(c.signedTau) : (c.rungs.find((x) => x.name === rung)?.f ?? 0);
          if (f > best) best = f;
        }
        return best;
      };
      expect(bestSalient('order', 'ord'), 'order τ_sym (salient)').toBeGreaterThan(0.9);
      expect(bestSalient('sales', 'ratio'), 'sales ratio (salient)').toBeGreaterThan(0.9);
    },
    120000,
  );
});
