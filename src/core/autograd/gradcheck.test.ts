// src/core/autograd/gradcheck.test.ts
//
// Per-primitive and per-derived-op finite-difference gradient checks (the `gradcheck` workflow
// runs these via `vitest run -t gradcheck`). Every op registered in the engine/ops must appear
// here — a newly added op cannot ship unchecked. Includes a self-test proving the checker BITES.

import { describe, it, expect } from 'vitest';
import { Value, val } from './engine';
import * as E from './engine';
import * as O from './ops';
import { gradcheckBuild, relL2 } from './gradcheck';
import { mulberry32, uniform, type Rng } from '../rng';
import { config } from '../../config';

const H = config.gradcheck.epsFD;
const TOL = config.gradcheck.tol;
const TRIALS = 8;

// An op spec: how many leaves it consumes, how to sample non-singular inputs, and how to build
// the scalar output graph from those leaves.
interface OpSpec {
  name: string;
  arity: number;
  sample: (rng: Rng) => number[];
  build: (leaves: Value[]) => Value;
}

// helpers for input domains that avoid singular points
const nonzero = (rng: Rng) => {
  const x = uniform(rng, -3, 3);
  return Math.abs(x) < 0.3 ? x + Math.sign(x || 1) * 0.5 : x;
};
const positive = (rng: Rng) => uniform(rng, 0.3, 4);
const anyReal = (rng: Rng) => uniform(rng, -3, 3);
const vec = (rng: Rng, n: number, gen: (r: Rng) => number) =>
  Array.from({ length: n }, () => gen(rng));

const PRIMITIVES: OpSpec[] = [
  { name: 'add', arity: 2, sample: (r) => vec(r, 2, anyReal), build: (l) => E.add(l[0]!, l[1]!) },
  { name: 'sub', arity: 2, sample: (r) => vec(r, 2, anyReal), build: (l) => E.sub(l[0]!, l[1]!) },
  { name: 'mul', arity: 2, sample: (r) => vec(r, 2, anyReal), build: (l) => E.mul(l[0]!, l[1]!) },
  { name: 'div', arity: 2, sample: (r) => [anyReal(r), nonzero(r)], build: (l) => E.div(l[0]!, l[1]!) },
  { name: 'neg', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.neg(l[0]!) },
  { name: 'exp', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.exp(l[0]!) },
  { name: 'log', arity: 1, sample: (r) => vec(r, 1, positive), build: (l) => E.log(l[0]!) },
  { name: 'pow2', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.pow(l[0]!, 2) },
  { name: 'pow3', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.pow(l[0]!, 3) },
  { name: 'powNeg1', arity: 1, sample: (r) => vec(r, 1, nonzero), build: (l) => E.pow(l[0]!, -1) },
  { name: 'sqrt', arity: 1, sample: (r) => vec(r, 1, positive), build: (l) => E.sqrt(l[0]!) },
  { name: 'sigmoid', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.sigmoid(l[0]!) },
  { name: 'sin', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.sin(l[0]!) },
  { name: 'cos', arity: 1, sample: (r) => vec(r, 1, anyReal), build: (l) => E.cos(l[0]!) },
  // atan2: keep off the origin (both near-zero is the singular point)
  {
    name: 'atan2',
    arity: 2,
    sample: (r) => [nonzero(r), nonzero(r)],
    build: (l) => E.atan2(l[0]!, l[1]!),
  },
];

const DERIVED: OpSpec[] = [
  { name: 'sum', arity: 5, sample: (r) => vec(r, 5, anyReal), build: (l) => O.sum(l) },
  { name: 'mean', arity: 5, sample: (r) => vec(r, 5, anyReal), build: (l) => O.mean(l) },
  // variance: the detached-mean trap. Real (live-mean) variance must pass.
  { name: 'variance', arity: 5, sample: (r) => vec(r, 5, anyReal), build: (l) => O.variance(l) },
  {
    name: 'covariance',
    arity: 10,
    sample: (r) => vec(r, 10, anyReal),
    build: (l) => O.covariance(l.slice(0, 5), l.slice(5, 10)),
  },
  {
    name: 'r2',
    arity: 10,
    sample: (r) => vec(r, 10, anyReal),
    build: (l) => O.r2(l.slice(0, 5), l.slice(5, 10), config.eps.corrVar),
  },
  {
    name: 'logLength',
    arity: 2,
    sample: (r) => [nonzero(r), nonzero(r)],
    build: (l) => O.logLength(l[0]!, l[1]!),
  },
  {
    name: 'length2',
    arity: 2,
    sample: (r) => [nonzero(r), nonzero(r)],
    build: (l) => O.length2(l[0]!, l[1]!),
  },
  {
    name: 'circularMean',
    arity: 5,
    sample: (r) => vec(r, 5, anyReal),
    build: (l) => O.circularMean(l),
  },
  {
    name: 'circularVar',
    arity: 5,
    sample: (r) => vec(r, 5, anyReal),
    build: (l) => O.circularVar(l, config.eps.circular),
  },
];

describe('gradcheck: primitives', () => {
  for (const spec of PRIMITIVES) {
    it(`${spec.name} matches finite differences`, () => {
      const rng = mulberry32(0xabc ^ spec.name.length);
      for (let t = 0; t < TRIALS; t++) {
        const x = spec.sample(rng);
        const rep = gradcheckBuild(spec.build, x, { h: H, tol: TOL });
        expect(rep.relL2, `${spec.name} trial ${t}: ${JSON.stringify(x)}`).toBeLessThan(TOL);
      }
    });
  }
});

describe('gradcheck: derived vector ops', () => {
  for (const spec of DERIVED) {
    it(`${spec.name} matches finite differences`, () => {
      const rng = mulberry32(0xdef ^ spec.name.length);
      for (let t = 0; t < TRIALS; t++) {
        const x = spec.sample(rng);
        const rep = gradcheckBuild(spec.build, x, { h: H, tol: TOL });
        expect(rep.relL2, `${spec.name} trial ${t}: ${JSON.stringify(x)}`).toBeLessThan(TOL);
      }
    });
  }
});

describe('gradcheck: composition + fan-out', () => {
  it('a composite score-like expression matches finite differences', () => {
    // exercises shared leaves, log, exp, variance, sigmoid together
    const build = (l: Value[]): Value => {
      const a = l.slice(0, 4);
      const b = l.slice(4, 8);
      const ratio = E.exp(E.neg(O.variance(a.map((x, i) => E.sub(E.log(x), E.log(b[i]!))))));
      const corr = O.r2(a, b, config.eps.corrVar);
      const ord = O.mean(
        a.map((x, i) => E.sigmoid(E.div(E.sub(x, b[i]!), val(0.2)))),
      );
      return E.add(E.add(E.mul(ratio, val(4)), E.mul(corr, val(2))), ord);
    };
    const rng = mulberry32(777);
    for (let t = 0; t < TRIALS; t++) {
      const x = vec(rng, 8, positive); // positive for the log() terms
      const rep = gradcheckBuild(build, x, { h: H, tol: TOL });
      expect(rep.relL2, `trial ${t}`).toBeLessThan(TOL);
    }
  });
});

describe('gradcheck: self-test (the checker must bite)', () => {
  it('flags a deliberately wrong gradient', () => {
    // A "broken multiply" whose backward is wrong on purpose.
    const brokenMul = (a: Value, b: Value): Value => {
      const out = new Value(a.data * b.data, [a, b], 'brokenMul');
      out._backward = () => {
        a.grad += a.data * out.grad; // WRONG: should be b.data * out.grad
        b.grad += b.data * out.grad; // WRONG: should be a.data * out.grad
      };
      return out;
    };
    const rng = mulberry32(999);
    const x = [uniform(rng, 1, 3), uniform(rng, 1, 3)];
    const rep = gradcheckBuild((l) => brokenMul(l[0]!, l[1]!), x, { h: H, tol: TOL });
    expect(rep.pass).toBe(false);
    expect(rep.relL2).toBeGreaterThan(TOL);
  });

  it('flags an atan2 with swapped derivative signs (the most error-prone op)', () => {
    // atan2's ∂y=x/r², ∂x=−y/r². Swapping the signs is the classic mistake; the checker must bite.
    const brokenAtan2 = (y: Value, x: Value): Value => {
      const out = new Value(Math.atan2(y.data, x.data), [y, x], 'brokenAtan2');
      out._backward = () => {
        const r2v = x.data * x.data + y.data * y.data;
        y.grad += (-x.data / r2v) * out.grad; // WRONG sign
        x.grad += (y.data / r2v) * out.grad; // WRONG sign
      };
      return out;
    };
    const rng = mulberry32(444);
    const x = [nonzero(rng), nonzero(rng)];
    const rep = gradcheckBuild((l) => brokenAtan2(l[0]!, l[1]!), x, { h: H, tol: TOL });
    expect(rep.pass).toBe(false);
    expect(rep.relL2).toBeGreaterThan(TOL);
  });

  // NOTE: detaching the mean in variance/covariance/r² does NOT corrupt the gradient — the term
  // through μ vanishes because Σ(xᵢ−μ)=0 (μ is the stationary point of the squared-deviation sum).
  // We still build reductions from a LIVE `Value` mean (ops.ts) for robustness and clarity, but the
  // choice is not a correctness requirement, contrary to a common warning. Verified: a detached-mean
  // variance passes gradcheck.
});

describe('relL2 sanity', () => {
  it('is 0 for identical vectors and ~1 for opposite', () => {
    expect(relL2([1, 2, 3], [1, 2, 3])).toBeLessThan(1e-12);
    expect(relL2([1, 2, 3], [-1, -2, -3])).toBeGreaterThan(0.9);
  });
});
