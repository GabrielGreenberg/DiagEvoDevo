// src/config.ts — THE SINGLE SOURCE OF EVERY TUNABLE.
//
// Principle II (workflows over re-derivation) and the modularity contract in
// ARCHITECTURE.md require that no tunable constant appears anywhere outside this file.
// The user edits the math by editing this file: weights, temperatures, penalty weights,
// optimizer hyperparameters, seeds. Every constant carries a comment tying it to CONCEPT.md.

/** Data-side scale types (CONCEPT.md §2). */
export const N_ITEMS = 12; // labels A..L
export const N_SEG_PARAMS = 4; // [sx, sy, ex, ey] per segment
export const N_PARAMS = N_ITEMS * N_SEG_PARAMS; // 48 — the optimized vector (CONCEPT.md §2)

export const config = {
  // ── Figure / data dimensions (CONCEPT §2) ────────────────────────────────
  N_ITEMS,
  N_SEG_PARAMS,
  N_PARAMS,

  // ── Fidelity ladder weights (CONCEPT §6). Invariant: w_ord < w_int < w_ratio ──
  // "more captured structure always scores higher." Asserted by a test.
  weights: {
    w_ord: 1.0,
    w_int: 2.0,
    w_ratio: 4.0,
  },

  // ── Ladder surrogate parameters ──────────────────────────────────────────
  // T: logistic temperature for the differentiable F_ord surrogate (→ exact as T→0).
  T: 0.1,
  // σ₀² in F_ratio = exp(−Var(log c − log v)/σ₀²).
  sigma0Sq: 1.0,

  // ── Numerical ε-guards (each carries a modeling meaning; never inline them) ──
  eps: {
    // Added to each variance in the r² denominator so a constant figure vector gives
    // F_int → 0 (correct: a flat figure has no interval structure) with a finite gradient.
    corrVar: 1e-9,
    // Floor inside circularVar's resultant length, avoids sqrt' blow-up at antipodal angles.
    circular: 1e-12,
    // Floor on squared segment length: magnitude = sqrt(dx²+dy²+length). Turns the zero-length
    // cusp into a finite value (log stays finite in F_ratio) so a collapsed segment can never make
    // the reward/gradient NaN and poison the whole optimizer. Tiny ⇒ negligible for real segments.
    length: 1e-9,
  },

  // ── Penalty weights (CONCEPT §8) — FIRST-CLASS, DEFAULT 0 (wired, off) ────
  // Sewn in at the deepest level per Principle I; enabling a weight has effect with no code change.
  penalties: {
    spuriousness: 0.0, // overencoding: structure asserted beyond the data
    frozenDof: 0.0, // Var(baseline) + circularVar(tilt): unassigned DOF should not vary
    economy: 0.0, // count of posited frames / active measurements (Occam pressure)
  },

  // ── Optimizer: Adam hyperparameters (CONCEPT §9) ─────────────────────────
  adam: {
    lr: 0.05,
    beta1: 0.9,
    beta2: 0.999,
    eps: 1e-8,
  },

  // ── Evolution / random-restart outer layer (CONCEPT §9) ──────────────────
  evolve: {
    populationSize: 8, // parallel restarts
    mutationSigma: 0.2, // gaussian perturbation scale for restart/mutation
    restartOnStall: true,
    maxRestarts: 20,
    outerEvery: 25, // run an evolve generation every N inner Adam steps
  },

  // ── Convergence detection: SCORE plateau, not param fixity (CONCEPT §9) ───
  // The optimum is a valley (scale/translation invariant) so params drift forever;
  // we watch the score window's spread instead.
  converge: {
    windowSize: 50,
    plateauEps: 1e-4, // max(window) − min(window) below this ⇒ plateau
    minSteps: 100, // never declare convergence before this
    maxSteps: 5000, // hard cap per run
    qualityThreshold: 0.9, // normalized score to count a converged run as "success" (bench/M6)
  },

  // ── Figure init (CONCEPT §2: random 48-vector from a seed) ───────────────
  figureInit: {
    min: 0,
    max: 100, // sampling box for initial segment endpoints
  },

  // ── Data generation (CONCEPT §2: 12 positive ratio values from a seed) ───
  dataInit: {
    min: 10,
    max: 1000, // strictly positive; ratio scale
    distribution: 'logUniform' as 'logUniform' | 'uniform',
  },

  // ── Default seeds (independent; both editable in the GUI) ─────────────────
  seeds: {
    figure: 1,
    data: 1,
  },

  // ── Gradcheck tolerance (ARCHITECTURE: ‖∇_ad − ∇_fd‖ < ε) ────────────────
  gradcheck: {
    epsFD: 1e-6, // central-difference step h
    tol: 1e-5, // relative-L2 tolerance
  },

  // ── Assignment policy default (CONCEPT §7: start Fixed, graduate to Best) ─
  assignmentPolicy: 'fixed' as 'fixed' | 'best',

  // ── Fixed assignment carriers (CONCEPT §7). Defaults need no posited frame. ──
  fixedCarriers: {
    // sales (ratio) → length (measurement #9); no frame required, bars emerge from length.
    sales: 'page.displacement.magnitude',
    // order (ordinal) → x-position (measurement #1); interval stamp ⊇ ordinal.
    order: 'page.start.projPar',
  },

  // ── Page geometry: the page supplies a direction, no origin (CONCEPT §3). ──
  pageDirection: [1, 0] as [number, number], // x-axis

  // ── Posited frame (fixed in v1; origin + direction). CONCEPT §3. ─────────
  frame: {
    origin: [0, 0] as [number, number],
    direction: [1, 0] as [number, number], // ∥ page in v1 (so run/rise/tilt coincide)
  },

  // ── GUI / render loop ─────────────────────────────────────────────────────
  stepsPerFrame: 20, // inner optimizer steps per animation frame (decouples fps from step size)
};
// NOTE: no `as const` — fields keep plain number/string types so the user (and tests / the optimizer)
// can override weights, penalty weights, and hyperparameters by spreading a modified copy.

export type Config = typeof config;
