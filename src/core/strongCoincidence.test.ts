// src/core/strongCoincidence.test.ts — adversarial gate for the STRONG (same-ink-path) coincidence
// mode (config.bonuses.coincidence.mode; CONCEPT §7; measurements/paths.ts).
//
// The weak bonus's verified blind spot: it cannot distinguish an AXIS (identity by construction)
// from a COLLAPSE (identity by degeneration) — the dot-plot and mid-anchor traps that forced the
// weight down to 0.2. Strong = weak × path-alignment × ink. Everything here checks the promised
// consequences and tries to break them:
//   • grounded golden bars: the end-y ≡ rise ≡ length triple's paths coincide EXACTLY (overlap =
//     the mean ink gate; ≈ 1 for bars taller than θ_ink);
//   • floating bars: (end-y, length) dies — the plumb starts on the AXIS, the ink floats — while
//     (rise, length) legitimately survives (a vertical segment's rise leg IS its ink);
//   • dot-plot collapse: the ink gate zeroes EVERY path pair exactly — the trap is closed;
//   • mid-anchor trap: the lone (mid-y, length) pair is path-killed; weak mode cannot even SEE
//     the difference (its coin(sales) is equal on golden and both traps to 3 decimals);
//   • spoke plots: (fr·end dist, length) coincides when segments run origin-ward — radial rulers
//     are honest ink;
//   • orientation symmetry: a path traced backwards is the same ink (kernel-exact), and a figure
//     mirrored across a vertical line keeps its bonus;
//   • the grounding gradient: ∂bonus/∂start_y pulls a floating baseline toward the axis HARDER
//     under strong than weak;
//   • weak mode + weight 0 stay bit-exact with the pre-strong HEAD (pinned totals); Value ≈ exact
//     lockstep and the full-score gradcheck hold in strong mode; the tape report bounds the cost.

import { describe, it, expect } from 'vitest';
import { val, backward, type Value } from './autograd/engine';
import { gradcheckBuild } from './autograd/gradcheck';
import { config, type Config, N_ITEMS } from '../config';
import { cloneFigure, segBase, seedToFigure, type Figure } from './figure';
import { scoreExact, scoreValue, type Breakdown } from './score';
import { gradScore } from './gradient';
import { carriers, carrierFor, allCarriers, getMeasurement } from './measurements/registry';
import {
  MeasurementPathsValue,
  MeasurementPathsExact,
  pathOverlap,
  pathOverlapN,
  strongOverlapN,
  type PathN,
} from './measurements/paths';
import { frameFromConfig, pageFromConfig } from './frame';
import { ScaleType } from './scale';
import { goldenBarChart, wellSeparatedData, valueScale } from './fixtures';
import { mulberry32, uniform } from './rng';

const data = wellSeparatedData();
const K = valueScale(data);
const golden = goldenBarChart(data, { k: K, spacing: 10, x0: 5 });
const leavesOf = (f: Figure): Value[] => Array.from(f, (x) => val(x));

// canonical distinct-carrier ids under the v1 geometry (registry dedup)
const LENGTH = 'page.displacement.magnitude';
const RISE = 'page.displacement.projPerp';
const RUN = 'page.displacement.projPar';
const END_Y = 'frame.end.projPerp';
const MID_Y = 'frame.midpoint.projPerp';
const START_X = 'frame.start.projPar';
const END_X = 'frame.end.projPar';
const FR_START_DIST = 'frame.start.magnitude';
const FR_END_DIST = 'frame.end.magnitude';
const FR_START_ANG = 'frame.start.angle';
const FR_END_ANG = 'frame.end.angle';

const strongCfg = (over: Partial<Config['bonuses']['coincidence']> = {}): Config => ({
  ...config,
  bonuses: { coincidence: { ...config.bonuses.coincidence, mode: 'strong', ...over } },
});
const STRONG = strongCfg();

const coinOf = (b: Breakdown, key: 'sales' | 'order'): number =>
  b.bonuses.relationCoin.find((r) => r.key === key)!.value;
const pairOf = (b: Breakdown, key: string, id1: string, id2: string) =>
  b.bonuses.pairs.find(
    (p) => p.key === key && ((p.a === id1 && p.b === id2) || (p.a === id2 && p.b === id1)),
  );

/** The recorded strong overlap of two carriers on a figure, composed from the exported pieces. */
function ovOf(f: Figure, id1: string, id2: string, cfg: Config = STRONG): number {
  const paths = new MeasurementPathsExact(f, frameFromConfig(cfg), pageFromConfig(cfg));
  const all = carriers(cfg);
  const pa = paths.pathsFor(carrierFor(id1, all).measurement)!;
  const pb = paths.pathsFor(carrierFor(id2, all).measurement)!;
  const gate = paths.inkGate(cfg.bonuses.coincidence.thetaInk);
  return strongOverlapN(pa, pb, gate, cfg.bonuses.coincidence.sigmaPath, cfg.eps.absSmooth);
}

function build(fill: (i: number) => [number, number, number, number]): Figure {
  const f = new Float64Array(N_ITEMS * 4);
  for (let i = 0; i < N_ITEMS; i++) {
    const b = segBase(i);
    const [sx, sy, ex, ey] = fill(i);
    f[b] = sx;
    f[b + 1] = sy;
    f[b + 2] = ex;
    f[b + 3] = ey;
  }
  return f;
}

// ── the trap geometries (reconstructed from the full-depth findings, CONCEPT §7 caveats) ──

/** DOT-PLOT COLLAPSE (seed-5 trap): every segment shrunk to a point at (ordered x, value-∝ y) —
 *  start ≡ mid ≡ end in BOTH axes "for free". */
const dotCollapse = build((i) => {
  const x = 5 + 10 * i;
  const y = K * data.values[i]!;
  return [x, y, x, y];
});

/** MID-ANCHOR TRAP (seed-1 trap): vertical bars floating at half height so the lone pair
 *  mid-y ≡ length holds (mid_y = L for a bar spanning [L/2, 3L/2]). */
const midAnchor = build((i) => {
  const x = 5 + 10 * i;
  const L = K * data.values[i]!;
  return [x, L / 2, x, (3 * L) / 2];
});

/** SPOKE PLOT: needles from the frame origin, length ∝ value, bearing monotone in the label —
 *  fr·end dist ≡ length is an ARRANGED identity whose ink paths coincide exactly. */
const spoke = build((i) => {
  const th = 0.1 + 0.12 * i;
  const r = K * data.values[i]!;
  return [0, 0, r * Math.cos(th), r * Math.sin(th)];
});

const floating = goldenBarChart(data, { k: K, spacing: 10, x0: 5, baseline: 40 });

// ── measurement paths: the v1 design table, structurally derived ─────────────────

describe('strong coincidence: measurement paths (paths.ts) match the design table under v1 geometry', () => {
  // one loud segment: start (10, 4), end (30, 24) ⇒ mid (20, 14); same on all items
  const f = build(() => [10, 4, 30, 24]);
  const frame = frameFromConfig(config);
  const page = pageFromConfig(config);
  const P = (id: string): PathN => {
    const paths = new MeasurementPathsExact(f, frame, page);
    return paths.pathsFor(getMeasurement(id))![0]!;
  };

  it('point x/y/dist paths: ruler from the axis to the point; corner convention (end_x, start_y)', () => {
    expect(P('frame.end.projPerp')).toEqual({ A: [30, 0], B: [30, 24] }); // end y: plumb from x-axis
    expect(P('frame.end.projPar')).toEqual({ A: [0, 24], B: [30, 24] }); // end x: ruler from y-axis
    expect(P('frame.end.magnitude')).toEqual({ A: [0, 0], B: [30, 24] }); // radial ruler
    expect(P('frame.midpoint.projPerp')).toEqual({ A: [20, 0], B: [20, 14] });
    expect(P('page.displacement.magnitude')).toEqual({ A: [10, 4], B: [30, 24] }); // the ink itself
    expect(P('page.displacement.projPar')).toEqual({ A: [10, 4], B: [30, 4] }); // run: parallel leg
    expect(P('page.displacement.projPerp')).toEqual({ A: [30, 4], B: [30, 24] }); // rise: perp leg
  });

  it('no linear ink-path: angle readings (arcs pending) and origin-free page point projections', () => {
    const paths = new MeasurementPathsExact(f, frame, page);
    expect(paths.pathsFor(getMeasurement('page.displacement.angle'))).toBeNull();
    expect(paths.pathsFor(getMeasurement('frame.end.angle'))).toBeNull();
    expect(paths.pathsFor(getMeasurement('page.start.projPar'))).toBeNull();
    expect(paths.pathsFor(getMeasurement('page.midpoint.projPerp'))).toBeNull();
  });

  it('Value twin builds the same endpoints (lockstep of the builders)', () => {
    const pv = new MeasurementPathsValue(leavesOf(f), frame, page);
    const pe = new MeasurementPathsExact(f, frame, page);
    for (const id of [END_Y, END_X, FR_END_DIST, MID_Y, LENGTH, RUN, RISE]) {
      const m = carrierFor(id, carriers(config)).measurement;
      const a = pv.pathsFor(m)!;
      const b = pe.pathsFor(m)!;
      for (let i = 0; i < N_ITEMS; i++) {
        expect(a[i]!.A[0].data).toBeCloseTo(b[i]!.A[0], 12);
        expect(a[i]!.A[1].data).toBeCloseTo(b[i]!.A[1], 12);
        expect(a[i]!.B[0].data).toBeCloseTo(b[i]!.B[0], 12);
        expect(a[i]!.B[1].data).toBeCloseTo(b[i]!.B[1], 12);
      }
    }
    // and the ink gate twins agree
    const gv = pv.inkGate(config.bonuses.coincidence.thetaInk);
    const ge = pe.inkGate(config.bonuses.coincidence.thetaInk);
    for (let i = 0; i < N_ITEMS; i++) expect(gv[i]!.data).toBeCloseTo(ge[i]!, 12);
  });
});

// ── the overlap kernel: smooth, orientation-symmetric, gradcheckable ─────────────

describe('strong coincidence: overlap kernel (orientation-symmetric smooth min)', () => {
  const sig = config.bonuses.coincidence.sigmaPath;
  const eps = config.eps.absSmooth;
  const p1: PathN = { A: [0, 0], B: [0, 30] };
  const p2: PathN = { A: [3, 1], B: [2, 28] };

  it('a path traced backwards is the same ink: swapping either path\'s endpoints is bit-exact', () => {
    const rev = (p: PathN): PathN => ({ A: p.B, B: p.A });
    expect(pathOverlapN(rev(p1), p2, sig, eps)).toBe(pathOverlapN(p1, p2, sig, eps));
    expect(pathOverlapN(p1, rev(p2), sig, eps)).toBe(pathOverlapN(p1, p2, sig, eps));
    expect(pathOverlapN(rev(p1), rev(p2), sig, eps)).toBe(pathOverlapN(p1, p2, sig, eps));
  });

  it('identical paths ⇒ ov ≈ 1 (ε-rounding only); separation decays monotonically at σ_path scale', () => {
    expect(pathOverlapN(p1, p1, sig, eps)).toBeGreaterThan(0.999999);
    expect(pathOverlapN(p1, p1, sig, eps)).toBeLessThan(1 + 1e-6);
    let prev = Infinity;
    for (const off of [0, 2, 5, 10, 20, 40]) {
      const shifted: PathN = { A: [off, 0], B: [off, 30] };
      const ov = pathOverlapN(p1, shifted, sig, eps);
      expect(ov).toBeLessThan(prev + 1e-12);
      prev = ov;
    }
    expect(pathOverlapN(p1, { A: [40, 0], B: [40, 30] }, sig, eps)).toBeLessThan(1e-10);
  });

  it('gradcheck: pathOverlap is smooth in all 8 endpoint coordinates (mid-slope region)', () => {
    const x = [0, 0, 0, 30, 3, 1, 2, 28];
    const rep = gradcheckBuild(
      (l) =>
        pathOverlap(
          { A: [l[0]!, l[1]!], B: [l[2]!, l[3]!] },
          { A: [l[4]!, l[5]!], B: [l[6]!, l[7]!] },
          sig,
          eps,
        ),
      x,
      { h: config.gradcheck.epsFD, tol: config.gradcheck.tol },
    );
    expect(rep.relL2).toBeLessThan(config.gradcheck.tol);
  });

  it('Value twin agrees with the exact twin', () => {
    const lift = (p: PathN) => ({ A: [val(p.A[0]), val(p.A[1])] as const, B: [val(p.B[0]), val(p.B[1])] as const });
    expect(pathOverlap(lift(p1), lift(p2), sig, eps).data).toBeCloseTo(pathOverlapN(p1, p2, sig, eps), 14);
  });
});

// ── the promised consequences, pair by pair ──────────────────────────────────────

describe('strong coincidence: axis vs collapse — the expected consequences', () => {
  it('grounded golden: the sales triple\'s paths coincide EXACTLY (overlap = mean ink gate)', () => {
    const gate = new MeasurementPathsExact(golden, frameFromConfig(config), pageFromConfig(config))
      .inkGate(config.bonuses.coincidence.thetaInk);
    let meanGate = 0;
    for (let i = 0; i < N_ITEMS; i++) meanGate += gate[i]! / N_ITEMS;
    for (const [a, b] of [
      [END_Y, LENGTH],
      [END_Y, RISE],
      [RISE, LENGTH],
    ] as const) {
      expect(ovOf(golden, a, b), `${a}~${b}`).toBeCloseTo(meanGate, 9); // pure gate: ov_i = 1
      expect(ovOf(golden, a, b)).toBeGreaterThan(0.75);
    }
    // bars taller than θ_ink push the gate to 1: pairwise strong ≈ 1 (k = 1 ⇒ min height 10)
    const tall = goldenBarChart(data, { k: 1, spacing: 10, x0: 5 });
    expect(ovOf(tall, END_Y, LENGTH)).toBeGreaterThan(0.95);
    expect(ovOf(tall, RISE, LENGTH)).toBeGreaterThan(0.95);
  });

  it('FLOATING bars: (end-y, length) ≈ 0 — plumb from the axis vs floating ink — while (rise, length) SURVIVES', () => {
    expect(ovOf(floating, END_Y, LENGTH)).toBeLessThan(1e-12);
    // a vertical segment's rise leg IS its ink, grounded or not: bit-for-bit the grounded value
    expect(ovOf(floating, RISE, LENGTH)).toBeCloseTo(ovOf(golden, RISE, LENGTH), 12);
    expect(ovOf(floating, RISE, LENGTH)).toBeGreaterThan(0.75);
    // and the breakdown shows exactly that: rise≡length listed, end-y≡length gone
    const b = scoreExact(floating, data, STRONG);
    expect(pairOf(b, 'sales', RISE, LENGTH)).toBeDefined();
    expect(pairOf(b, 'sales', RISE, LENGTH)!.overlap).toBeGreaterThan(0.75);
    expect(pairOf(b, 'sales', END_Y, LENGTH)).toBeUndefined(); // gated below display dust
  });

  it('DOT-PLOT COLLAPSE: the ink gate zeroes EVERY path pair exactly; only weak-formula angle dust remains', () => {
    const paths = new MeasurementPathsExact(dotCollapse, frameFromConfig(config), pageFromConfig(config));
    const gate = paths.inkGate(config.bonuses.coincidence.thetaInk);
    for (let i = 0; i < N_ITEMS; i++) expect(gate[i]).toBe(0); // ‖disp‖² = 0 ⇒ g = 0 EXACTLY
    expect(ovOf(dotCollapse, START_X, END_X)).toBe(0);
    expect(ovOf(dotCollapse, MID_Y, END_Y)).toBe(0);
    const bs = scoreExact(dotCollapse, data, STRONG);
    const bw = scoreExact(dotCollapse, data);
    expect(coinOf(bw, 'sales')).toBeGreaterThan(0.3); // the weak trap is REAL…
    expect(coinOf(bw, 'order')).toBeGreaterThan(0.3);
    expect(coinOf(bs, 'sales')).toBeLessThan(0.01); // …and strong closes it
    expect(coinOf(bs, 'order')).toBeLessThan(0.001);
    expect(bs.bonuses.coincidence).toBeLessThan(2e-3);
    // the surviving rows are angle-class fallback pairs only (no linear ink-path ⇒ weak formula),
    // and they are bit-identical to their weak-mode contributions
    for (const p of bs.bonuses.pairs) {
      expect(p.overlap).toBeUndefined();
      expect(carrierFor(p.a, carriers(config)).unitClass).toBe('angle');
    }
    const pw = pairOf(bw, 'sales', FR_START_ANG, FR_END_ANG);
    const ps = pairOf(bs, 'sales', FR_START_ANG, FR_END_ANG);
    expect(ps).toBeDefined();
    expect(ps!.contribution).toBe(pw!.contribution);
  });

  it('MID-ANCHOR TRAP: (mid-y, length) is path-killed; the legitimate (rise, length) persists', () => {
    expect(ovOf(midAnchor, MID_Y, LENGTH)).toBeLessThan(0.1); // exp(−L²/4σ²) per item
    expect(ovOf(midAnchor, RISE, LENGTH)).toBeGreaterThan(0.75);
    const b = scoreExact(midAnchor, data, STRONG);
    const trapPair = pairOf(b, 'sales', MID_Y, LENGTH);
    const risePair = pairOf(b, 'sales', RISE, LENGTH);
    expect(risePair!.contribution).toBeGreaterThan(0.5);
    expect(trapPair === undefined || trapPair.contribution < 0.1).toBe(true);
    // the recorded overlap is EXACTLY the exported composition (single source of truth)
    if (trapPair !== undefined) {
      expect(trapPair.overlap).toBeCloseTo(ovOf(midAnchor, MID_Y, LENGTH), 12);
    }
  });

  it('SPOKE PLOT: origin-ward segments make (fr·end dist, length) honest coincident ink', () => {
    expect(ovOf(spoke, FR_END_DIST, LENGTH)).toBeGreaterThan(0.75);
    expect(ovOf(spoke, RUN, LENGTH)).toBeLessThan(0.25); // the dogleg is NOT the radial ink
    const b = scoreExact(spoke, data, STRONG);
    const p = pairOf(b, 'sales', FR_END_DIST, LENGTH);
    expect(p).toBeDefined();
    expect(p!.overlap).toBeGreaterThan(0.75);
    expect(p!.contribution).toBeGreaterThan(0.5);
  });

  it('the AXIS is what survives: golden order coincidence flows through start-x ≡ fr·start dist', () => {
    // verticality's start-x ≡ end-x rulers sit at different heights — different ink, gated away —
    // but a grounded start's x-ruler IS the radial ruler from the origin: identity by construction
    expect(ovOf(golden, START_X, END_X)).toBeLessThan(0.05);
    expect(ovOf(golden, START_X, FR_START_DIST)).toBeGreaterThan(0.75);
    const b = scoreExact(golden, data, STRONG);
    const axis = pairOf(b, 'order', START_X, FR_START_DIST);
    expect(axis).toBeDefined();
    expect(axis!.contribution).toBeGreaterThan(0.5);
  });

  it('discrimination the weak mode PROVABLY lacks: weak coin(sales) ties golden with both traps; strong separates', () => {
    const wG = coinOf(scoreExact(golden, data), 'sales');
    const wM = coinOf(scoreExact(midAnchor, data), 'sales');
    const wD = coinOf(scoreExact(dotCollapse, data), 'sales');
    expect(Math.abs(wG - wM)).toBeLessThan(0.01); // the blind spot, pinned honestly
    expect(Math.abs(wG - wD)).toBeLessThan(0.01);
    const sG = coinOf(scoreExact(golden, data, STRONG), 'sales');
    const sM = coinOf(scoreExact(midAnchor, data, STRONG), 'sales');
    const sD = coinOf(scoreExact(dotCollapse, data, STRONG), 'sales');
    expect(sG).toBeGreaterThan(1.5 * sM); // golden's 3-pair grounded stack beats the trap's lone rise≡length
    expect(sM).toBeGreaterThan(10 * sD); // any real ink beats a collapse
    // and the strong TOTALS rank the legible figure first
    const tG = scoreExact(golden, data, STRONG).total;
    const tM = scoreExact(midAnchor, data, STRONG).total;
    const tD = scoreExact(dotCollapse, data, STRONG).total;
    expect(tG).toBeGreaterThan(tM);
    expect(tM).toBeGreaterThan(tD);
  });

  it('NEAR-collapse pays proportionally: 3-unit whisker "dots" keep < 1/3 of their weak coincidence', () => {
    const whisker = build((i) => {
      const x = 5 + 10 * i;
      const y = K * data.values[i]!;
      return [x, y, x, y + 3];
    });
    const sw = coinOf(scoreExact(whisker, data), 'sales');
    const ss = coinOf(scoreExact(whisker, data, STRONG), 'sales');
    expect(sw).toBeGreaterThan(0.1); // the weak bonus still likes it…
    expect(ss).toBeLessThan(sw / 3); // …strong charges the ink gate g(3) ≈ 0.26 on every pair
  });
});

// ── orientation symmetry at figure level ─────────────────────────────────────────

describe('strong coincidence: orientation symmetry (mirrored figure)', () => {
  const mirror = (f: Figure): Figure => {
    const m = cloneFigure(f);
    for (let i = 0; i < N_ITEMS; i++) {
      const b = segBase(i);
      m[b] = 120 - f[b]!;
      m[b + 2] = 120 - f[b + 2]!;
    }
    return m;
  };

  it('unit overlaps are exactly mirror-invariant; figure-level bonus agrees to 1e-4 in both modes', () => {
    for (const [a, b] of [
      [END_Y, LENGTH],
      [RISE, LENGTH],
      [START_X, END_X],
      [START_X, FR_START_DIST],
    ] as const) {
      expect(ovOf(mirror(golden), a, b), `${a}~${b}`).toBeCloseTo(ovOf(golden, a, b), 12);
    }
    for (const f of [golden, midAnchor]) {
      // residual asymmetry is the q-side only (fRatio/angle carriers see mirrored x), never the ink
      expect(Math.abs(scoreExact(mirror(f), data).bonuses.coincidence - scoreExact(f, data).bonuses.coincidence)).toBeLessThan(1e-4);
      expect(
        Math.abs(
          scoreExact(mirror(f), data, STRONG).bonuses.coincidence -
            scoreExact(f, data, STRONG).bonuses.coincidence,
        ),
      ).toBeLessThan(1e-4);
    }
  });
});

// ── the grounding gradient: the axis-seeking pull ────────────────────────────────

describe('strong coincidence: the grounding gradient (∂bonus/∂start_y restores toward the axis)', () => {
  const startYPull = (baseline: number, cfg: Config): number => {
    const f = goldenBarChart(data, { k: K, spacing: 10, x0: 5, baseline });
    const leaves = leavesOf(f);
    const sv = scoreValue(leaves, data, cfg);
    backward(sv.bonus);
    let g = 0;
    for (let i = 0; i < N_ITEMS; i++) g += leaves[segBase(i) + 1]!.grad;
    return g;
  };

  it('floating baselines feel a restoring pull, STRICTLY stronger under strong than weak', () => {
    for (const b of [2, 5, 8]) {
      const weak = startYPull(b, config);
      const strong = startYPull(b, STRONG);
      expect(weak, `weak b=${b}`).toBeLessThan(0);
      expect(strong, `strong b=${b}`).toBeLessThan(weak); // more negative: the added axis-seeking pull
    }
  });
});

// ── weak / off: bit-exact with the pre-strong HEAD ───────────────────────────────

describe('strong coincidence: mode "weak" (the default) and weight 0 are bit-exact with HEAD', () => {
  it('the default mode is weak, and the strong knobs exist with their documented defaults', () => {
    expect(config.bonuses.coincidence.mode).toBe('weak');
    expect(config.bonuses.coincidence.sigmaPath).toBe(5);
    expect(config.bonuses.coincidence.thetaInk).toBe(5);
  });

  it('weak-mode totals reproduce the pinned HEAD values BIT-EXACTLY (both paths)', () => {
    // Pinned from commit c643315 via scratch/strong_baseline_head.ts (2026-07-03). These are the
    // v2.2 DEFAULTS' values: if a default knob is retuned, re-run that probe and re-pin.
    expect(scoreExact(golden, data).total).toBe(1.5560520650450400);
    expect(scoreExact(golden, data).bonuses.coincidence).toBe(0.15048171043718322);
    expect(scoreValue(leavesOf(golden), data).total.data).toBe(1.5119368382771405);
    expect(scoreExact(seedToFigure(3), data).total).toBe(0.10912366886728150);
    expect(scoreExact(seedToFigure(7), data).total).toBe(0.024334817488558050);
    expect(scoreExact(seedToFigure(42), data).total).toBe(0.072190986019742623);
  });

  it('weak mode records NO overlap fields; strong mode records them on path pairs only, ∈ [0,1]', () => {
    for (const p of scoreExact(golden, data).bonuses.pairs) expect(p.overlap).toBeUndefined();
    const bs = scoreExact(golden, data, STRONG);
    expect(bs.bonuses.pairs.length).toBeGreaterThan(0);
    for (const p of bs.bonuses.pairs) {
      const angle = carrierFor(p.a, carriers(config)).unitClass === 'angle';
      if (angle) expect(p.overlap).toBeUndefined();
      else {
        expect(p.overlap).toBeGreaterThanOrEqual(0);
        expect(p.overlap).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('weight 0 disables strong mode identically to weak: root stays sub(), zero pair nodes', () => {
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
    const sOff = scoreValue(leavesOf(golden), data, strongCfg({ weight: 0 }));
    const wOff = scoreValue(leavesOf(golden), data, {
      ...config,
      bonuses: { coincidence: { ...config.bonuses.coincidence, weight: 0 } },
    });
    expect(sOff.total._op).toBe('-');
    expect(sOff.total.data === sOff.reward.data - sOff.penalty.data).toBe(true);
    expect(countNodes(sOff.total)).toBe(countNodes(wOff.total));
    const b = scoreExact(golden, data, strongCfg({ weight: 0 }));
    expect(b.total === b.reward - b.penalty).toBe(true);
    expect(b.bonuses.pairs).toEqual([]);
  });

  it('EMPTY/mixed censuses stay finite in strong mode (shifted frame: page projections pair weakly)', () => {
    // a shifted frame splits page/frame point projections into DISTINCT carriers; page ones have
    // no ruler zero ⇒ their pairs fall back to the weak formula (paths.ts header) — must be finite
    const shifted: Config = {
      ...STRONG,
      frame: { ...config.frame, origin: [10, 0] as [number, number] },
    };
    const b = scoreExact(golden, data, shifted);
    expect(Number.isFinite(b.bonuses.coincidence)).toBe(true);
    const gs = gradScore(golden, data, shifted);
    expect(Number.isFinite(gs.score)).toBe(true);
    for (const g of gs.grad) expect(Number.isFinite(g)).toBe(true);
    // and the disabled-everything degenerate case from the weak gate still holds under strong
    const salesIds = allCarriers(shifted)
      .filter((c) => c.stamp === ScaleType.Ratio || c.stamp === ScaleType.Cyclic)
      .map((c) => c.id);
    const cfg: Config = { ...shifted, carriers: { disabled: salesIds } };
    const b2 = scoreExact(golden, data, cfg);
    expect(coinOf(b2, 'sales')).toBe(0);
    expect(Number.isFinite(b2.total)).toBe(true);
  });
});

// ── lockstep + gradcheck + tape report ───────────────────────────────────────────

describe('strong coincidence: lockstep, gradcheck, tape', () => {
  it('Value ≈ exact at small T with strong mode active', () => {
    const cfgT: Config = { ...STRONG, T: 0.002 };
    for (const [name, f] of [
      ['golden', golden],
      ['midAnchor', midAnchor],
      ['spoke', spoke],
      ['random', seedToFigure(5)],
    ] as [string, Figure][]) {
      const sv = scoreValue(leavesOf(f), data, cfgT);
      const se = scoreExact(f, data, cfgT);
      expect(Math.abs(sv.bonus.data - se.bonuses.coincidence), name).toBeLessThan(1e-3);
      expect(Math.abs(sv.total.data - se.total), name).toBeLessThan(0.05);
    }
  });

  it('gradcheck: full score in strong mode (jittered golden and jittered floating baseline)', () => {
    for (const [seed, base] of [
      [77, 0],
      [78, 5], // kernels mid-slope: the ov gradients are ACTIVE here
    ] as const) {
      const rng = mulberry32(seed);
      const f = cloneFigure(goldenBarChart(data, { k: K, spacing: 10, x0: 5, baseline: base }));
      for (let i = 0; i < f.length; i++) f[i] = f[i]! + uniform(rng, -0.5, 0.5);
      const rep = gradcheckBuild((leaves) => scoreValue(leaves, data, STRONG).total, Array.from(f), {
        h: config.gradcheck.epsFD,
        tol: 1e-5,
      });
      expect(rep.relL2, `baseline=${base}`).toBeLessThan(1e-5);
    }
  });

  it('tape report: overlaps are cached per pair across relations (strong ≤ 2.2× weak nodes)', () => {
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
    const nWeak = countNodes(scoreValue(leavesOf(golden), data).total);
    const nStrong = countNodes(scoreValue(leavesOf(golden), data, STRONG).total);
    console.log(`[strong coincidence] tape nodes: weak=${nWeak} strong=${nStrong} (×${(nStrong / nWeak).toFixed(2)})`);
    expect(nStrong).toBeGreaterThan(nWeak); // the paths ARE on the tape (the pull is differentiable)
    expect(nStrong).toBeLessThan(2.2 * nWeak); // and cached: one overlap per unordered pair, ever
  });
});
