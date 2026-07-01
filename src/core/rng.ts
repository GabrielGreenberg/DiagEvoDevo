// src/core/rng.ts
//
// One seeded PRNG for the whole system. ALL randomness (data generation, figure init, mutation,
// random restarts, gradcheck sampling) flows through this so every result is reproducible from a
// seed — persistence claims "reproducible from seeds" and `bench` needs determinism.
// mulberry32: tiny, fast, good enough for a toy-scale search; deterministic across platforms.

export type Rng = () => number; // uniform in [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [min, max). */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: Rng, mean = 0, sigma = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng(); // avoid log(0)
  while (v === 0) v = rng();
  const mag = Math.sqrt(-2 * Math.log(u));
  return mean + sigma * mag * Math.cos(2 * Math.PI * v);
}
