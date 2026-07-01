// scripts/bench.ts
//
// Headless convergence-rate + steps/sec report (Principle II — evidence for the M6 gate). Runs a batch
// of figure seeds under the configured policy, reports convergence rate, per-rung fidelity, mean steps,
// throughput, and flags pathologies (right order / wrong ratio = truncated-baseline or log-scale).
//
// Run: npm run bench   [or]   npx vite-node scripts/bench.ts

import { config } from '../src/config';
import { createSession } from '../src/optim/session';

const N_SEEDS = 24;
const DATA_SEED = 1;

interface Row {
  seed: number;
  quality: number;
  steps: number;
  byCap: boolean;
  salesOrd: number;
  salesInt: number;
  salesRatio: number;
  orderOrd: number;
  ms: number;
}

const rows: Row[] = [];
let totalScoreEvals = 0;
const t0 = performance.now();

for (let s = 1; s <= N_SEEDS; s++) {
  const st0 = performance.now();
  const session = createSession(s, DATA_SEED);
  session.run();
  const r = session.result();
  const dt = performance.now() - st0;
  totalScoreEvals += r.steps * config.evolve.populationSize;
  const sales = r.score.assignments.find((a) => a.key === 'sales')!;
  const order = r.score.assignments.find((a) => a.key === 'order')!;
  const rung = (a: typeof sales, name: string): number => a.rungs.find((x) => x.name === name)?.f ?? NaN;
  rows.push({
    seed: s,
    quality: r.score.quality,
    steps: r.steps,
    byCap: r.convergedByCap,
    salesOrd: rung(sales, 'ord'),
    salesInt: rung(sales, 'int'),
    salesRatio: rung(sales, 'ratio'),
    orderOrd: rung(order, 'ord'),
    ms: dt,
  });
}

const wall = (performance.now() - t0) / 1000;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const q = rows.map((r) => r.quality);
const threshold = config.converge.qualityThreshold;
const converged = rows.filter((r) => r.quality >= threshold).length;
const byCap = rows.filter((r) => r.byCap).length;
// pathology: order captured (salesOrd high) but ratio missed (right order, wrong proportion)
const pathologies = rows.filter((r) => r.salesOrd > 0.9 && r.salesRatio < 0.7).length;

const f = (x: number): string => x.toFixed(3);
console.log(`\n=== bench: ${N_SEEDS} figure seeds, data seed ${DATA_SEED}, policy=${config.assignmentPolicy} ===`);
console.log('seed  quality  steps  byCap  sales[ord/int/ratio]   order[ord]');
for (const r of rows) {
  console.log(
    `${String(r.seed).padStart(3)}   ${f(r.quality)}   ${String(r.steps).padStart(4)}   ${r.byCap ? 'CAP' : '   '}   ` +
      `${f(r.salesOrd)}/${f(r.salesInt)}/${f(r.salesRatio)}      ${f(r.orderOrd)}`,
  );
}
console.log('---');
console.log(`convergence rate (quality ≥ ${threshold}): ${converged}/${N_SEEDS} (${((100 * converged) / N_SEEDS).toFixed(0)}%)`);
console.log(`mean quality: ${f(mean(q))}   mean steps: ${mean(rows.map((r) => r.steps)).toFixed(0)}   hit maxSteps: ${byCap}/${N_SEEDS}`);
console.log(`truncated/log pathologies (ord>0.9, ratio<0.7): ${pathologies}/${N_SEEDS}`);
console.log(`wall: ${wall.toFixed(2)}s   score-evals: ${totalScoreEvals}   throughput: ${(totalScoreEvals / wall).toFixed(0)} score-evals/s\n`);
