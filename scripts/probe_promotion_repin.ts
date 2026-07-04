// scripts/probe_promotion_repin.ts — honest recomputation for the strong-promotion test repin
// (2026-07-03). The default config.bonuses.coincidence.mode flipped 'weak' → 'strong'; tests that
// pinned DEFAULT-config values need their strong equivalents, and weak-pinned tests move to an
// explicit weak override. This probe prints both sides so nothing is guessed.
//
// Run: npx vite-node scripts/probe_promotion_repin.ts

import { val, type Value } from '../src/core/autograd/engine';
import { config, type Config, N_ITEMS } from '../src/config';
import { segBase, seedToFigure, type Figure } from '../src/core/figure';
import { scoreExact, scoreValue, type Breakdown } from '../src/core/score';
import { wellSeparatedData, goldenBarChart, valueScale } from '../src/core/fixtures';
import { mulberry32, uniform } from '../src/core/rng';

const modeCfg = (mode: 'weak' | 'strong'): Config => ({
  ...config,
  bonuses: { coincidence: { ...config.bonuses.coincidence, mode } },
});
const WEAK = modeCfg('weak');
const STRONG = modeCfg('strong');

const data = wellSeparatedData();
const K = valueScale(data);
const golden = goldenBarChart(data, { k: K, spacing: 10, x0: 5 });
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));
const coinOf = (b: Breakdown, key: string): number =>
  b.bonuses.relationCoin.find((r) => r.key === key)!.value;

console.log('default mode:', config.bonuses.coincidence.mode, 'weight:', config.bonuses.coincidence.weight);

// ── 1. weak-explicit pins: must reproduce the HEAD-pinned v2.2 numbers BIT-EXACTLY ──
console.log('\n[1] explicit-weak pins (expect bit-equal to the c643315 pins):');
console.log('  golden total        ', scoreExact(golden, data, WEAK).total, ' pin 1.5560520650450400');
console.log('  golden coincidence  ', scoreExact(golden, data, WEAK).bonuses.coincidence, ' pin 0.15048171043718322');
console.log('  golden value total  ', scoreValue(leavesOf(golden), data, WEAK).total.data, ' pin 1.5119368382771405');
console.log('  seed3 total         ', scoreExact(seedToFigure(3), data, WEAK).total, ' pin 0.10912366886728150');
console.log('  seed7 total         ', scoreExact(seedToFigure(7), data, WEAK).total, ' pin 0.024334817488558050');
console.log('  seed42 total        ', scoreExact(seedToFigure(42), data, WEAK).total, ' pin 0.072190986019742623');

// ── 2. strong-default values for coincidence.test.ts golden thresholds ──
console.log('\n[2] golden under the STRONG default:');
const bs = scoreExact(golden, data);
console.log('  bonuses.coincidence ', bs.bonuses.coincidence);
console.log('  coin(sales)         ', coinOf(bs, 'sales'));
console.log('  coin(order)         ', coinOf(bs, 'order'));

// ── 3. randomHeightBars(9): the gates test's strong-default order sanity value ──
function randomHeightBars(seed: number): Figure {
  const rng = mulberry32(seed);
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const x = 5 + i * 10;
    f[b] = x;
    f[b + 1] = 0;
    f[b + 2] = x;
    f[b + 3] = uniform(rng, 10, 100);
  }
  return f;
}
const rhb = randomHeightBars(9);
const rw = scoreExact(rhb, data, WEAK);
const rs = scoreExact(rhb, data, STRONG);
console.log('\n[3] randomHeightBars(9):');
console.log('  weak   coin(sales)', coinOf(rw, 'sales'), ' coin(order)', coinOf(rw, 'order'));
console.log('  strong coin(sales)', coinOf(rs, 'sales'), ' coin(order)', coinOf(rs, 'order'));

// ── 4. tape node counts: explicit weak vs explicit strong (the ≤2.2× budget) ──
const countNodes = (root: Value): number => {
  const seen = new Set<Value>();
  const stack = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const c of n._prev) stack.push(c);
  }
  return seen.size;
};
const nWeak = countNodes(scoreValue(leavesOf(golden), data, WEAK).total);
const nStrong = countNodes(scoreValue(leavesOf(golden), data, STRONG).total);
console.log('\n[4] tape nodes: weak', nWeak, 'strong', nStrong, 'ratio', (nStrong / nWeak).toFixed(3));
