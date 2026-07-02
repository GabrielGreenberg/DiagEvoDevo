// scripts/accept.ts
//
// THE ADVERSARIAL ACCEPTANCE WORKFLOW for the scoring-v2 redesign
// (handoffs/2026-07-01-scoring-v2-design.md §Acceptance gates). Run: npm run accept
//
// Gates (all hard-fail — the script exits 1 if any gate fails):
//   1. Fixture-family ranking: the LEGIBLE fixtures (golden label-ordered bars, mirrored bars) beat
//      every audit-winning degenerate (value-sorted bars, nested ray, collinear pileup, value
//      spiral) AND 50 random figures; label-ordered beats value-sorted. The automatic legibility
//      characterizer is calibrated here too: it must call the legible fixtures legible and every
//      degenerate/random not.
//   2. Monotonicity: adding a matching carrier never lowers a relation; one perfect+salient carrier
//      beats many mediocre ones.
//   3. Salience: a sub-pixel perfect carrier earns ≈0; growing its spread recovers monotonically.
//   4. Signed ratio: mirrored bars score FULL ratio; mixed signs don't; no NaN anywhere.
//   5. Sessions on figure seeds 1..6 (data seed 1): ≥5/6 achieve DIVISION OF LABOR (some salient
//      carrier τ_sym ≥ 0.9 for order AND some salient carrier ratio ≥ 0.9 for sales) and ≥5/6
//      characterize as LEGIBLE (division of labor + grounded/parallel structure, not mush).
//      Per seed we report quality, best order/sales carriers, data-ink penalty, a rounded
//      coordinate dump, and a one-line visual characterization.
//
// Flags:
//   --quick       reduced per-run step cap (config-tuning rounds only; final acceptance runs full)
//   --pairs       additionally run figure/data seed pairs (2,2) and (3,3) — informational rows
//   --seeds=a,b   run only these figure seeds (debugging; the ≥5/6 gates still assume 6)

import { config } from '../src/config';
import { seedToDataSet } from '../src/core/data';
import { seedToFigure, cloneFigure, segBase, type Figure } from '../src/core/figure';
import { scoreExact, type Breakdown, type RelationBreakdown } from '../src/core/score';
import { fRatioExact, lseMeanN } from '../src/core/fidelity/ladder';
import { varianceN } from '../src/core/statsN';
import {
  wellSeparatedData,
  goldenBarChart,
  loudGoldenBarChart,
  auditDegenerates,
  valueScale,
} from '../src/core/fixtures';
import { createSession } from '../src/optim/session';
import type { DataSet } from '../src/core/data';

// vite-node runs on Node, but the project deliberately compiles without @types/node (browser lib
// only) — declare the two process members this workflow needs instead of widening the whole build.
declare const process: { argv: string[]; exit(code: number): never };

const QUICK = process.argv.includes('--quick');
const PAIRS = process.argv.includes('--pairs');
const seedsArg = process.argv.find((a) => a.startsWith('--seeds='));
const SESSION_SEEDS = seedsArg
  ? seedsArg.slice('--seeds='.length).split(',').map(Number)
  : [1, 2, 3, 4, 5, 6];

// ── acceptance thresholds — GATE DEFINITIONS from the spec, not scoring tunables ──
const RUNG_TARGET = 0.9; // gate 5: τ_sym / ratio the best salient carrier must reach
const SALIENT = 0.5; // a carrier counts as salient when its reader-resolution gate is above this
const RANK_MARGIN = 0.1; // gate 1: legible fixtures must win by at least this score margin
const DOL_MIN = 5; // gate 5: of the 6 core seeds, at least this many must divide labor / be legible
const N_RANDOM = 50; // gate 1: size of the random-figure cohort
const QUICK_MAX_STEPS = 1200; // --quick session cap (tuning rounds; full runs use config.converge)
// ── characterizer thresholds (calibrated adversarially by gate 1 on the fixture family) ──
const GROUND_FRAC = 0.5; // grounded: a coordinate whose spread < this fraction of salience θ_len
const PARALLEL_R = 0.9; // parallel: axial resultant length |mean e^{2iθ}| at least this
const MIN_SEG_LEN = 1; // segments shorter than this (page units) have no readable angle
const LOUD_Q = 0.25; // a salient carrier whose best q (any relation) is below this is "loud mush"

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}
const checks: Check[] = [];
const check = (gate: string, name: string, pass: boolean, detail: string): void => {
  checks.push({ name: `[gate ${gate}] ${name}`, pass, detail });
};

// LOUD golden fixtures (2026-07-02, confirmed finding): spacing 100 puts the x-position ORDER
// carriers far above the reader-resolution θ_len (salience ≈ 1.0, like every session endpoint's
// carriers) instead of the 0.92-salient spacing-10 layout — gate comparisons are like-for-like.
// The GUI's reference cell uses the same layout (core/fixtures.loudGoldenBarChart).
const golden = loudGoldenBarChart;
const mirrored = (d: DataSet): Figure =>
  goldenBarChart(d, { k: -valueScale(d), spacing: 100, x0: 5 });
const rel = (b: Breakdown, key: 'sales' | 'order'): RelationBreakdown =>
  b.relations.find((r) => r.key === key)!;

// ── the automatic legibility characterizer ───────────────────────────────────────
// Structural, chart-form-agnostic reads of a figure: grounding (a quiet endpoint coordinate),
// parallelism (axial angle alignment — direction-symmetric, like the v2 rungs), the best SALIENT
// order/sales carriers, and loud-but-meaningless carriers. LEGIBLE := division of labor AND some
// structural regularity (grounded OR parallel). Calibrated by gate 1 against the fixture family.

interface BestCarrier {
  label: string;
  f: number;
  salience: number;
}

/** One high-fidelity salient sales reading (the redundancy report; informational, not a gate). */
interface SalesReading {
  id: string;
  label: string;
  salience: number;
  ratio: number; // exact ratio-rung fidelity
  cellF: number; // whole-ladder cell fidelity Σ w_r·F_r / maxRung (un-gated by salience)
}

interface Characterization {
  grounded: string | null;
  parallel: string | null;
  bestOrder: BestCarrier | null; // best salient carrier's exact τ_sym for the order relation
  bestSales: BestCarrier | null; // best salient carrier's exact ratio fidelity for sales
  divisionOfLabor: boolean;
  // sales REDUNDANCY (the grounding signature): every salient carrier with cellF ≥ RUNG_TARGET.
  // A grounded bar chart makes length AND a position reading carry sales simultaneously — the
  // coincidence that reads as "segments anchored on a frame axis".
  salesRedundancy: SalesReading[];
  lenPosPair: boolean; // a length-type AND a position/distance-type reading both ≥ RUNG_TARGET
  loudMeaningless: number;
  ink: number; // weighted data-ink (spuriousness) penalty
  legible: boolean;
  line: string;
}

function bestSalient(r: RelationBreakdown, rung: 'ord' | 'ratio'): BestCarrier | null {
  let best: BestCarrier | null = null;
  for (const c of r.carriers) {
    if (c.salience < SALIENT) continue;
    const f = c.rungs.find((x) => x.name === rung)?.f ?? 0;
    if (!best || f > best.f) best = { label: c.label, f, salience: c.salience };
  }
  return best;
}

function characterize(figure: Figure, b: Breakdown): Characterization {
  const n = config.N_ITEMS;
  // grounding: any endpoint coordinate quiet below reader resolution reads as a common anchor
  const coords: [string, number[]][] = [
    ['start x', []],
    ['start y', []],
    ['end x', []],
    ['end y', []],
  ];
  for (let i = 0; i < n; i++) {
    const base = segBase(i);
    for (let k = 0; k < 4; k++) coords[k]![1].push(figure[base + k]!);
  }
  const tol = GROUND_FRAC * config.salience.thetaLen;
  const quiet = coords
    .map(([name, xs]) => [name, Math.sqrt(varianceN(xs))] as const)
    .filter(([, s]) => s < tol)
    .map(([name, s]) => `${name} σ=${s.toFixed(1)}`);
  const grounded = quiet.length > 0 ? quiet.join(', ') : null;

  // parallelism: axial (2θ) resultant over segments long enough to have a readable angle
  let c2 = 0;
  let s2 = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const base = segBase(i);
    const dx = figure[base + 2]! - figure[base]!;
    const dy = figure[base + 3]! - figure[base + 1]!;
    if (Math.hypot(dx, dy) < MIN_SEG_LEN) continue;
    const th = Math.atan2(dy, dx);
    c2 += Math.cos(2 * th);
    s2 += Math.sin(2 * th);
    m++;
  }
  let parallel: string | null = null;
  if (m >= n / 2) {
    const R = Math.hypot(c2, s2) / m;
    if (R >= PARALLEL_R) {
      let axis = ((Math.atan2(s2, c2) / 2) * 180) / Math.PI; // axial angle ∈ (−90, 90]
      if (axis < 0) axis += 180;
      const orient =
        Math.abs(axis - 90) <= 15 ? '~vertical' : axis <= 15 || axis >= 165 ? '~horizontal' : `~${axis.toFixed(0)}°`;
      parallel = `${orient} R=${R.toFixed(2)}`;
    }
  }

  const order = rel(b, 'order');
  const sales = rel(b, 'sales');
  const bestOrder = bestSalient(order, 'ord');
  const bestSales = bestSalient(sales, 'ratio');
  const divisionOfLabor = (bestOrder?.f ?? 0) >= RUNG_TARGET && (bestSales?.f ?? 0) >= RUNG_TARGET;

  // sales redundancy: salient readings whose whole-ladder cell fidelity reaches RUNG_TARGET
  const W = config.weights;
  const maxRung = W.w_ord + W.w_int + W.w_ratio;
  const rungW = (name: string): number =>
    name === 'ord' ? W.w_ord : name === 'int' ? W.w_int : W.w_ratio;
  const salesRedundancy: SalesReading[] = sales.carriers
    .map((c) => ({
      id: c.id,
      label: c.label,
      salience: c.salience,
      ratio: c.rungs.find((x) => x.name === 'ratio')?.f ?? 0,
      cellF: c.rungs.reduce((s, r) => s + rungW(r.name) * r.f, 0) / maxRung,
    }))
    .filter((c) => c.salience >= SALIENT && c.cellF >= RUNG_TARGET)
    .sort((a, b2) => b2.cellF - a.cellF);
  const isLength = (id: string): boolean => id.includes('displacement.magnitude');
  const isPosition = (id: string): boolean =>
    id.includes('.start.') || id.includes('.end.') || id.includes('.midpoint.');
  const lenPosPair =
    salesRedundancy.some((c) => isLength(c.id)) && salesRedundancy.some((c) => isPosition(c.id));

  // loud-but-meaningless carriers: salient variation whose best cell (either relation) is ~nothing
  const maxQ = new Map<string, number>();
  const sal = new Map<string, number>();
  for (const r of b.relations) {
    for (const c of r.carriers) {
      maxQ.set(c.id, Math.max(maxQ.get(c.id) ?? 0, c.q));
      sal.set(c.id, c.salience);
    }
  }
  let loudMeaningless = 0;
  for (const [id, s] of sal) if (s >= SALIENT && (maxQ.get(id) ?? 0) < LOUD_Q) loudMeaningless++;

  const ink = b.penalties.find((p) => p.name === 'spuriousness')?.weighted ?? 0;
  const legible = divisionOfLabor && (grounded !== null || parallel !== null);
  const bits = [
    grounded ? `grounded[${grounded}]` : 'ungrounded',
    parallel ? `parallel[${parallel}]` : 'angles scattered',
    bestOrder
      ? `order→${bestOrder.label} τ=${bestOrder.f.toFixed(2)}`
      : 'no salient order carrier',
    bestSales
      ? `sales→${bestSales.label} ratio=${bestSales.f.toFixed(2)}`
      : 'no salient sales carrier',
  ];
  if (loudMeaningless > 0) bits.push(`${loudMeaningless} loud meaningless carrier(s)`);
  return {
    grounded,
    parallel,
    bestOrder,
    bestSales,
    divisionOfLabor,
    salesRedundancy,
    lenPosPair,
    loudMeaningless,
    ink,
    legible,
    line: `${bits.join(' · ')} ⇒ ${legible ? 'LEGIBLE' : 'not legible'}`,
  };
}

// ── gate 1: fixture-family ranking + characterizer calibration ──────────────────
interface FamilyRow {
  name: string;
  legibleFixture: boolean; // expected-legible member of the family
  total: number;
  quality: number;
  ch: Characterization;
}

for (const d of [seedToDataSet(config.seeds.data), wellSeparatedData()]) {
  const tag = d.seed === -1 ? 'well-separated' : `data seed ${d.seed}`;
  const family: { name: string; figure: Figure; legibleFixture: boolean }[] = [
    { name: 'golden label-ordered bars', figure: golden(d), legibleFixture: true },
    { name: 'mirrored bars', figure: mirrored(d), legibleFixture: true },
    ...auditDegenerates(d).map((x) => ({ ...x, legibleFixture: false })),
  ];
  const rows: FamilyRow[] = family.map(({ name, figure, legibleFixture }) => {
    const b = scoreExact(figure, d);
    return { name, legibleFixture, total: b.total, quality: b.quality, ch: characterize(figure, b) };
  });
  // 50-random cohort (figure seeds 1..N_RANDOM — includes the session init figures)
  const randoms: FamilyRow[] = [];
  for (let s = 1; s <= N_RANDOM; s++) {
    const f = seedToFigure(s);
    const b = scoreExact(f, d);
    randoms.push({
      name: `random ${s}`,
      legibleFixture: false,
      total: b.total,
      quality: b.quality,
      ch: characterize(f, b),
    });
  }
  const bestRandom = randoms.reduce((a, r) => (r.total > a.total ? r : a));
  const sortedRandom = [...randoms].sort((a, b) => a.total - b.total);
  const medianRandom = sortedRandom[Math.floor(N_RANDOM / 2)]!;

  const ranked = [...rows, bestRandom].sort((a, b) => b.total - a.total);
  console.log(`\n=== gate 1: fixture-family ranking (${tag}) ===`);
  ranked.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${r.name.padEnd(28)} total ${r.total.toFixed(3).padStart(7)}  quality ${r.quality.toFixed(3)}  ink ${r.ch.ink.toFixed(3)}`,
    );
    console.log(`      ${r.ch.line}`);
  });
  console.log(
    `      (random ×${N_RANDOM}: best ${bestRandom.total.toFixed(3)} [${bestRandom.name}], median ${medianRandom.total.toFixed(3)}, worst ${sortedRandom[0]!.total.toFixed(3)})`,
  );

  const legibles = rows.filter((r) => r.legibleFixture);
  const degenerates = rows.filter((r) => !r.legibleFixture);
  for (const L of legibles) {
    for (const D of degenerates) {
      check(
        '1',
        `${L.name} beats ${D.name} (${tag})`,
        L.total > D.total + RANK_MARGIN,
        `${L.total.toFixed(3)} vs ${D.total.toFixed(3)}`,
      );
    }
    check(
      '1',
      `${L.name} beats all ${N_RANDOM} randoms (${tag})`,
      L.total > bestRandom.total + RANK_MARGIN,
      `${L.total.toFixed(3)} vs best random ${bestRandom.total.toFixed(3)}`,
    );
  }
  const g = rows.find((r) => r.name === 'golden label-ordered bars')!;
  const vs = rows.find((r) => r.name === 'value-sorted bars')!;
  check(
    '1',
    `label-ordered beats value-sorted (${tag})`,
    g.total > vs.total + RANK_MARGIN,
    `${g.total.toFixed(3)} vs ${vs.total.toFixed(3)}`,
  );
  // characterizer calibration: it must call the legible fixtures legible and nothing else
  for (const r of rows) {
    check(
      '1',
      `characterizer: ${r.name} ${r.legibleFixture ? 'LEGIBLE' : 'not legible'} (${tag})`,
      r.ch.legible === r.legibleFixture,
      r.ch.line,
    );
  }
  const legibleRandoms = randoms.filter((r) => r.ch.legible).length;
  check('1', `characterizer: no random is legible (${tag})`, legibleRandoms === 0, `${legibleRandoms}/${N_RANDOM} legible`);
}

// ── gate 2: monotonicity ─────────────────────────────────────────────────────────
{
  const d = wellSeparatedData();
  const K = valueScale(d);
  const g = golden(d);
  // random-orientation bars: |displacement| matches sales but rise/end-y do NOT — fewer matching
  // carriers must mean a strictly lower sales relation.
  const lengthOnly = cloneFigure(g);
  for (let i = 0; i < 12; i++) {
    const b = segBase(i);
    const x = g[b]!;
    const len = K * d.values[i]!;
    const th = (i * 2.399963) % (2 * Math.PI);
    lengthOnly[b] = x;
    lengthOnly[b + 1] = 0;
    lengthOnly[b + 2] = x + len * Math.cos(th);
    lengthOnly[b + 3] = len * Math.sin(th);
  }
  const sG = rel(scoreExact(g, d), 'sales').aggregated;
  const sL = rel(scoreExact(lengthOnly, d), 'sales').aggregated;
  check('2', 'more matching carriers raise the relation', sG > sL + 1e-4, `${sG.toFixed(4)} vs ${sL.toFixed(4)}`);
  // LSE: strictly monotone in every cell, and one perfect beats many mediocre
  const beta = config.aggregation.beta;
  const qs = [0.2, 0.5, 0.05, 0.9, 0.0];
  const base = lseMeanN(qs, beta);
  const raised = lseMeanN(qs.map((q, i) => (i === 2 ? q + 0.05 : q)), beta);
  check('2', 'raising any cell strictly raises the LSE', raised > base, `${base.toFixed(4)} → ${raised.toFixed(4)}`);
  const onePerfect = lseMeanN([1, ...new Array<number>(11).fill(0)], beta);
  const allMediocre = lseMeanN(new Array<number>(12).fill(0.6), beta);
  check('2', 'one perfect carrier beats many mediocre', onePerfect > allMediocre, `${onePerfect.toFixed(4)} vs ${allMediocre.toFixed(4)}`);
}

// ── gate 3: salience ─────────────────────────────────────────────────────────────
{
  const d = wellSeparatedData();
  const g = golden(d);
  const scaled = (k: number): Figure => Float64Array.from(g, (x) => x * k);
  const sub = rel(scoreExact(scaled(0.001), d), 'sales').aggregated;
  check('3', 'sub-pixel perfect sales carriers earn ≈0', sub < 0.02, `aggregated ${sub.toFixed(4)}`);
  const rewards = [0.001, 0.01, 0.1, 1].map((k) => scoreExact(scaled(k), d).reward);
  const monotone = rewards.every((r, i) => i === 0 || r > rewards[i - 1]!);
  check('3', 'growing the spread recovers the score', monotone, rewards.map((r) => r.toFixed(3)).join(' < '));
}

// ── gate 4: signed ratio + NaN suite ─────────────────────────────────────────────
{
  const d = wellSeparatedData();
  const v = Array.from(d.values);
  const S = config.sigma0Sq,
    Kp = config.ratioSign.kappa,
    ME = config.eps.length,
    SE = config.eps.sigDenom;
  const plus = fRatioExact(v.map((x) => 0.1 * x), v, S, Kp, ME, SE);
  const minus = fRatioExact(v.map((x) => -0.1 * x), v, S, Kp, ME, SE);
  check('4', 'proportional carrier scores full ratio', plus > 0.999, `F=${plus.toFixed(6)}`);
  check('4', 'MIRRORED carrier scores full ratio', minus > 0.999, `F=${minus.toFixed(6)}`);
  const mixed = fRatioExact(v.map((x, i) => (i % 2 === 0 ? 0.1 * x : -0.1 * x)), v, S, Kp, ME, SE);
  check('4', 'mixed-sign carrier earns ~nothing', mixed < 0.35, `F=${mixed.toFixed(6)}`);
  // degeneracy: collapsed, all-zero, random figures — every number finite
  const collapsed = cloneFigure(golden(d));
  for (let i = 0; i < 12; i++) {
    const b = segBase(i);
    collapsed[b + 2] = collapsed[b]!;
    collapsed[b + 3] = collapsed[b + 1]!;
  }
  const figures: [string, Figure][] = [
    ['collapsed', collapsed],
    ['all-zero', new Float64Array(48)],
    ['random 5', seedToFigure(5)],
  ];
  for (const [name, f] of figures) {
    const b = scoreExact(f, d);
    const finite =
      Number.isFinite(b.total) &&
      b.relations.every((r) => r.carriers.every((c) => Number.isFinite(c.q)));
    check('4', `no NaN on ${name} figure`, finite, `total ${b.total.toFixed(4)}`);
  }
}

// ── gate 5: sessions (division of labor + legibility) ────────────────────────────
interface SeedReport {
  figureSeed: number;
  dataSeed: number;
  core: boolean; // counts toward the ≥5/6 gates
  quality: number;
  ch: Characterization;
  steps: number;
  byCap: boolean;
  secs: number;
}

function runSeed(figureSeed: number, dataSeed: number, core: boolean): SeedReport {
  const cfgRun = QUICK
    ? { ...config, converge: { ...config.converge, maxSteps: QUICK_MAX_STEPS } }
    : config;
  const t0 = Date.now();
  const s = createSession(figureSeed, dataSeed, cfgRun);
  s.run();
  const r = s.result();
  const secs = (Date.now() - t0) / 1000;
  const ch = characterize(r.figure, r.score);
  console.log(
    `\nseed (${figureSeed},${dataSeed}): steps=${r.steps}${r.convergedByCap ? ' (cap)' : ' (plateau)'}  quality=${r.score.quality.toFixed(3)}  total=${r.score.total.toFixed(3)}  ink=${ch.ink.toFixed(3)}  [${secs.toFixed(0)}s]`,
  );
  console.log(
    `  order → ${ch.bestOrder ? `${ch.bestOrder.label}: τ_sym=${ch.bestOrder.f.toFixed(3)} sal=${ch.bestOrder.salience.toFixed(2)}` : 'NO salient carrier'}` +
      `   sales → ${ch.bestSales ? `${ch.bestSales.label}: ratio=${ch.bestSales.f.toFixed(3)} sal=${ch.bestSales.salience.toFixed(2)}` : 'NO salient carrier'}`,
  );
  console.log(`  division of labor: ${ch.divisionOfLabor ? 'YES' : 'no'}   ${ch.line}`);
  console.log(
    `  sales redundancy: ${ch.salesRedundancy.length} salient reading(s) with cell fidelity ≥ ${RUNG_TARGET}` +
      (ch.lenPosPair ? '  [LENGTH+POSITION PAIR]' : '') +
      (ch.salesRedundancy.length > 0
        ? ` — ${ch.salesRedundancy.map((c) => `${c.label} ${c.cellF.toFixed(2)}`).join(', ')}`
        : ''),
  );
  for (let i = 0; i < 12; i++) {
    const b = segBase(i);
    const [sx, sy, ex, ey] = [r.figure[b]!, r.figure[b + 1]!, r.figure[b + 2]!, r.figure[b + 3]!];
    console.log(
      `  ${String.fromCharCode(65 + i)}: (${sx.toFixed(1)}, ${sy.toFixed(1)}) -> (${ex.toFixed(1)}, ${ey.toFixed(1)})  len=${Math.hypot(ex - sx, ey - sy).toFixed(1)}  [v=${r.data.values[i]!.toFixed(0)}]`,
    );
  }
  return {
    figureSeed,
    dataSeed,
    core,
    quality: r.score.quality,
    ch,
    steps: r.steps,
    byCap: r.convergedByCap,
    secs,
  };
}

console.log(
  `\n=== gate 5: sessions (figure seeds ${SESSION_SEEDS.join(',')}; data seed ${config.seeds.data}${QUICK ? `; QUICK cap ${QUICK_MAX_STEPS}` : ''}) ===`,
);
const reports: SeedReport[] = SESSION_SEEDS.map((s) => runSeed(s, config.seeds.data, true));
if (PAIRS) for (const [f, d] of [[2, 2], [3, 3]] as const) reports.push(runSeed(f, d, false));

const core = reports.filter((r) => r.core);
const dol = core.filter((r) => r.ch.divisionOfLabor).length;
const leg = core.filter((r) => r.ch.legible).length;
check(
  '5',
  `division of labor on ≥${DOL_MIN}/${core.length} seeds`,
  dol >= DOL_MIN,
  `${dol}/${core.length} (${core.map((r) => `${r.figureSeed}:${r.ch.divisionOfLabor ? 'Y' : 'n'}`).join(' ')})`,
);
check(
  '5',
  `legible characterization on ≥${DOL_MIN}/${core.length} seeds`,
  leg >= DOL_MIN,
  `${leg}/${core.length} (${core.map((r) => `${r.figureSeed}:${r.ch.legible ? 'Y' : 'n'}`).join(' ')})`,
);

// ── report ────────────────────────────────────────────────────────────────────────
console.log(`\n=== accept: scoring-v2 acceptance gates (scoring=${config.scoring}${QUICK ? ', QUICK' : ''}) ===`);
let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? '  ok ' : 'FAIL '} ${c.name} — ${c.detail}`);
}
console.log(`---\n${checks.length - failed}/${checks.length} checks passed`);
if (QUICK) console.log('NOTE: --quick run (reduced session cap) — final acceptance must run without flags.');
if (failed > 0) {
  console.error(`accept: ${failed} FAILED`);
  process.exit(1);
}
