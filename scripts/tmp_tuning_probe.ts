// scripts/tmp_tuning_probe.ts — TEMPORARY acceptance-tuning probe (deleted before final check).
// Scores the six run-1 evolved endpoints (comet basin: seeds 1,3,6 · parallel basin: 2,4,5) plus
// golden bars under candidate config-knob variants, to see which knob direction re-ranks the
// PARALLEL basin above the COMET basin before spending full session runs.
import { config, type Config } from '../src/config';
import { seedToDataSet } from '../src/core/data';
import { scoreExact } from '../src/core/score';
import { goldenBarChart, valueScale } from '../src/core/fixtures';

const F = (rows: number[][]): Float64Array => Float64Array.from(rows.flat());

// run-1 endpoint dumps (1-decimal rounding is fine for ranking probes)
const seed1 = F([
  [288.7, 291.9, 45.7, 32.0], [249.1, 259.5, 2.4, 1.7], [215.0, 235.9, 28.6, 19.8],
  [188.2, 215.7, 208.3, 142.0], [161.4, 189.5, 191.6, 129.2], [138.4, 161.7, 8.6, 6.0],
  [110.3, 128.0, 40.9, 28.3], [82.5, 95.7, 65.5, 46.0], [57.6, 67.2, 16.8, 11.6],
  [37.0, 44.4, 224.1, 160.2], [16.0, 19.0, 19.9, 13.9], [0.2, 0.3, 22.8, 16.7],
]);
const seed2 = F([
  [-23.7, -23.0, 23.2, -22.9], [29.3, -8.6, 31.8, -8.2], [34.1, 7.1, 63.3, 7.8],
  [-50.0, 24.7, 169.2, 25.0], [172.6, 40.8, -26.6, 42.0], [88.5, 57.1, 97.2, 57.9],
  [137.7, 76.7, 95.7, 77.4], [169.1, 97.8, 100.2, 98.3], [162.2, 121.0, 145.1, 120.9],
  [285.1, 144.4, 47.3, 145.4], [193.8, 167.8, 173.8, 167.8], [215.6, 195.4, 191.4, 195.4],
]);
const seed3 = F([
  [306.1, -125.9, 38.9, 211.7], [235.2, -86.5, 2.0, 173.4], [203.0, -58.4, 24.0, 146.9],
  [179.5, -30.6, 172.1, 121.6], [144.8, -5.1, 160.2, 97.6], [102.0, 19.6, 7.3, 73.2],
  [34.0, 45.5, 35.4, 47.4], [8.1, 63.4, 56.4, 26.3], [-18.5, 83.4, 14.0, 3.5],
  [-39.9, 105.0, 189.9, -17.0], [-65.4, 126.1, 16.4, -39.9], [-95.4, 150.9, 19.6, -66.8],
]);
const seed4 = F([
  [205.0, 188.4, 201.9, 224.9], [172.5, 192.7, 171.6, 194.4], [150.5, 163.0, 149.3, 185.8],
  [127.4, 26.5, 126.1, 195.2], [104.6, 22.9, 104.9, 177.5], [82.2, 91.8, 84.0, 98.4],
  [58.6, 68.4, 63.7, 99.7], [41.1, 102.9, 46.2, 51.8], [24.6, 67.6, 26.8, 54.7],
  [9.4, 141.9, 10.7, -44.6], [-5.1, 41.0, -6.6, 25.8], [-24.8, -13.9, -17.1, 2.6],
]);
const seed5 = F([
  [40.9, 286.8, 43.2, -87.7], [2.1, 249.8, 2.3, -51.8], [25.3, 213.4, 27.3, -18.1],
  [189.1, 184.8, 192.0, 12.0], [174.5, 156.1, 178.7, 40.6], [7.4, 129.6, 8.5, 67.1],
  [35.8, 102.2, 39.9, 96.1], [59.0, 76.9, 64.4, 120.0], [14.6, 51.3, 16.0, 146.3],
  [203.9, 23.3, 206.4, 174.0], [17.1, -7.0, 18.6, 203.4], [20.6, -40.4, 22.2, 239.2],
]);
const seed6 = F([
  [238.7, 249.9, 43.5, 30.1], [211.1, 228.5, 2.3, 1.6], [184.5, 208.8, 27.2, 18.8],
  [160.2, 192.4, 201.6, 133.8], [137.5, 169.1, 182.6, 123.4], [117.6, 143.7, 8.2, 5.7],
  [94.6, 114.0, 39.2, 26.7], [71.8, 85.0, 62.5, 43.6], [50.1, 59.8, 16.1, 11.0],
  [32.3, 39.2, 216.6, 153.0], [14.1, 16.9, 18.9, 13.2], [0.1, 0.2, 21.6, 15.8],
]);

const data = seedToDataSet(config.seeds.data);
const golden = goldenBarChart(data, { k: valueScale(data), spacing: 10, x0: 5 });
const figures: [string, Float64Array][] = [
  ['comet s1   ', seed1], ['comet s3   ', seed3], ['comet s6   ', seed6],
  ['parallel s2', seed2], ['parallel s4', seed4], ['parallel s5', seed5],
  ['golden bars', golden],
];

const variants: [string, Partial<Config>][] = [
  ['base (beta10 ink0.25 thL10)', {}],
  ['beta 14', { aggregation: { ...config.aggregation, beta: 14 } }],
  ['beta 6', { aggregation: { ...config.aggregation, beta: 6 } }],
  ['ink 0.5', { penalties: { ...config.penalties, spuriousness: 0.5 } }],
  ['ink 0.6', { penalties: { ...config.penalties, spuriousness: 0.6 } }],
  ['thetaLen 20', { salience: { ...config.salience, thetaLen: 20 } }],
  ['thetaAngle 0.6', { salience: { ...config.salience, thetaAngle: 0.6 } }],
  ['beta14 + ink0.5', {
    aggregation: { ...config.aggregation, beta: 14 },
    penalties: { ...config.penalties, spuriousness: 0.5 },
  }],
];

for (const [vname, over] of variants) {
  const cfg: Config = { ...config, ...over };
  const rows = figures.map(([name, f]) => {
    const b = scoreExact(f, data, cfg);
    return { name, total: b.total, reward: b.reward, pen: b.penalty };
  });
  const ranked = [...rows].sort((a, b) => b.total - a.total);
  console.log(`\n── ${vname} ──`);
  for (const r of ranked)
    console.log(`  ${r.name}  total ${r.total.toFixed(3)}  reward ${r.reward.toFixed(3)}  pen ${r.pen.toFixed(3)}`);
}
