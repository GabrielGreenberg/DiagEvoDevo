// scripts/bench.ts
//
// Headless convergence + steps/sec report for the COMPREHENSIVE matrix score (Principle II). For each
// seed: reward, per-relation best-measurement fidelity + how many measurements track the data, steps,
// throughput. "Converged" = the best measurement in EACH relation tracks the data (fidelity ≥ 0.9).
//
// Run: npm run bench   [or]   npx vite-node scripts/bench.ts

import { config } from '../src/config';
import { createSession } from '../src/optim/session';
import type { RelationBreakdown } from '../src/core/score';

const N_SEEDS = 24;
const DATA_SEED = 1;
const MATCH = 0.9;

const bestFrac = (rel: RelationBreakdown): number => {
  const maxRung = rel.measurements.length ? rel.maxReward / rel.measurements.length : 1;
  return (rel.measurements[0]?.reward ?? 0) / maxRung;
};
const nTracking = (rel: RelationBreakdown): number => {
  const maxRung = rel.measurements.length ? rel.maxReward / rel.measurements.length : 1;
  return rel.measurements.filter((m) => m.reward / maxRung >= MATCH).length;
};

interface Row {
  seed: number;
  reward: number;
  steps: number;
  byCap: boolean;
  salesBest: number;
  salesTrack: number;
  orderBest: number;
  orderTrack: number;
  ok: boolean;
}

const rows: Row[] = [];
let totalScoreEvals = 0;
const t0 = performance.now();

for (let s = 1; s <= N_SEEDS; s++) {
  const session = createSession(s, DATA_SEED);
  session.run();
  const r = session.result();
  totalScoreEvals += r.steps * config.evolve.populationSize;
  const sales = r.score.relations.find((a) => a.key === 'sales')!;
  const order = r.score.relations.find((a) => a.key === 'order')!;
  const salesBest = bestFrac(sales);
  const orderBest = bestFrac(order);
  rows.push({
    seed: s,
    reward: r.score.reward,
    steps: r.steps,
    byCap: r.convergedByCap,
    salesBest,
    salesTrack: nTracking(sales),
    orderBest,
    orderTrack: nTracking(order),
    ok: salesBest >= MATCH && orderBest >= MATCH,
  });
}

const wall = (performance.now() - t0) / 1000;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const okCount = rows.filter((r) => r.ok).length;
const byCap = rows.filter((r) => r.byCap).length;
const f = (x: number): string => x.toFixed(3);

console.log(`\n=== bench: ${N_SEEDS} seeds, data ${DATA_SEED}, scoring=${config.scoring} ===`);
console.log('seed  reward  steps  cap  sales[best/#track]  order[best/#track]  ok');
for (const r of rows) {
  console.log(
    `${String(r.seed).padStart(3)}  ${r.reward.toFixed(1).padStart(6)}  ${String(r.steps).padStart(4)}  ${r.byCap ? 'CAP' : '   '}  ` +
      `${f(r.salesBest)}/${String(r.salesTrack).padStart(2)}          ${f(r.orderBest)}/${String(r.orderTrack).padStart(2)}          ${r.ok ? '✓' : '·'}`,
  );
}
console.log('---');
console.log(`best-carrier convergence (sales & order best ≥ ${MATCH}): ${okCount}/${N_SEEDS} (${((100 * okCount) / N_SEEDS).toFixed(0)}%)`);
console.log(`mean reward: ${mean(rows.map((r) => r.reward)).toFixed(1)}   mean steps: ${mean(rows.map((r) => r.steps)).toFixed(0)}   hit maxSteps: ${byCap}/${N_SEEDS}`);
console.log(`mean measurements tracking: sales ${mean(rows.map((r) => r.salesTrack)).toFixed(1)}/20 · order ${mean(rows.map((r) => r.orderTrack)).toFixed(1)}/26`);
console.log(`wall: ${wall.toFixed(2)}s   score-evals: ${totalScoreEvals}   throughput: ${(totalScoreEvals / wall).toFixed(0)} score-evals/s\n`);
