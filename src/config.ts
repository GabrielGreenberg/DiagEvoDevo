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
  // T: dimensionless logistic temperature for the differentiable F_ord surrogate. The margin is
  // normalized by spread(c) (floored at the legibility scale, see `legibility`), so T is scale-free
  // (→ exact F_ord as T→0). This is the FINAL (annealed-to) temperature; the optimizer anneals T
  // from anneal.tStart down to this value (see below).
  T: 0.1,
  // σ₀² in F_ratio = exp(−Var(log|c| − log v)/σ₀²) · coh(c) (v2 signed-safe form, CONCEPT §6).
  sigma0Sq: 1.0,

  // ── v2 aggregation: within-relation smooth-max (CONCEPT §6, scoring-v2 design) ──
  aggregation: {
    // β: LSE sharpness in relation(R) = (1/β)·log(mean_m exp(β·q_m)). One excellent carrier
    // dominates the relation; every additional matching carrier still STRICTLY raises it (the
    // "more matches wins" bonus is monotone, no longer a linear trade against perfection).
    // β→∞ = hard max, β→0 = plain mean. Also the data-ink penalty's smoothmax temperature.
    beta: 10,
  },

  // ── v2 salience: the reader-resolution gate (CONCEPT §6; home of the Cleveland–McGill anchor) ──
  salience: {
    // s(c) = Var(c)/(Var(c)+θ²), θ per unit class. A carrier whose spread is below the reader's
    // resolution θ is illegible: its cells earn ~0 reward and salient-but-meaningless variation
    // is what the data-ink penalty charges for. θ_len is in page units, θ_ang in radians.
    thetaLen: 10,
    thetaAngle: 0.35,
  },

  // ── v2 legibility floor for the ordinal surrogate margin (CONCEPT §6) ─────
  legibility: {
    // fOrd's margin denominator is T·max(spread(c), floor). The floor (per unit class of the
    // carrier) kills the 1/spread gradient explosion on near-constant carriers AND closes the
    // sub-pixel-order loophole: order compressed below the legibility scale reads as ties.
    spreadFloorLen: 2, // page units, for position/length carriers
    spreadFloorAngle: 0.05, // radians, for angle carriers
  },

  // ── v2.1 signed-ratio coherence (CONCEPT §6; scoring-v2 review fix) ───────
  ratioSign: {
    // coh(c) = |2·mean_i σ(cᵢ/(κ·ŝ·vᵢ))−1| / tanh(1/(2κ)), ŝ = exp(mean(log|c|−log v)): magnitude
    // carries proportion, but a COHERENT sign (either sign — mirrored encodings are legible) is
    // required for ratio credit. Each entry's sign test is normalized by its own v-IMPLIED magnitude
    // κ·ŝ·vᵢ, and the ceiling tanh(1/(2κ)) is divided out, so F_ratio = 1 EXACTLY at c = ±k·v and
    // proportionality is a stationary point (the earlier spread-relative test scored small-but-
    // legitimate entries as sign-incoherent, capping perfect carriers at ~0.68 on real data and
    // making a power-law warp the optimum). κ is the fraction of the implied magnitude at which an
    // entry counts as decisively signed — a SHARP sign test, not a magnitude tolerance. Keep
    // κ ≲ 0.32 (n=12): the ceiling derivation needs σ(1/κ) ≥ 1 − 1/(2n) (see ladder.cohCeil).
    kappa: 0.2,
  },

  // ── Ordinal temperature annealing (CONCEPT §9: evolution/GD for global ordering) ──
  // Early in a run a LARGE temperature keeps every pair in the sigmoid's responsive region, giving a
  // global sorting force even on far-apart inversions; annealing T down to `T` sharpens to exact order.
  // A continuation method that lets gradient descent sort the ordinal carrier (which it otherwise can't).
  anneal: {
    enabled: true,
    tStart: 3.0, // initial (large) dimensionless temperature
    tau: 250, // exponential decay time constant in steps: T(k) = T + (tStart−T)·exp(−k/tau)
  },

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
    // ALSO the magnitude floor inside F_ratio v2: |cᵢ| = sqrt(cᵢ²+ε) keeps log|c| finite at c=0.
    length: 1e-9,
    // Smoothing of |x| as sqrt(x²+ε) in τ_sym and coh(c): keeps the direction-symmetric fidelities
    // differentiable at their fold (x=0, i.e. chance level). sqrt(ε)=1e-6 is the value at the fold.
    absSmooth: 1e-12,
    // Additive guard on the coh(c) sign-test denominator κ·spread(c): keeps cᵢ/(κ·spread+ε) finite
    // for an exactly-constant carrier (σ(0)=½ each ⇒ coh≈0: a degenerate carrier earns NO ratio credit).
    sigDenom: 1e-9,
    // Tolerance for the STRUCTURAL geometry tests in the carrier dedup (frame ∥ page? origin at 0?).
    // These are exact identities of the configured geometry, so the tolerance is machine-scale.
    geom: 1e-12,
  },

  // ── Penalty weights (CONCEPT §8) ──────────────────────────────────────────
  // Sewn in at the deepest level per Principle I; changing a weight has effect with no code change.
  penalties: {
    // DATA-INK (v2 SEMANTICS — this term was repurposed from "overencoding" by the scoring-v2
    // redesign): salient variation that carries NO data relation is fabricated structure.
    //   penalty = w · mean_m [ s_m · (1 − smoothmax_R q_m(R)) ]
    // over the distinct carriers m, with the same LSE smoothmax temperature as `aggregation.beta`.
    // ON by default: it supplies the grounding / parallelism / quiet-unassigned-DOF pressure the
    // audit found missing, without hard-coding any chart form.
    // 0.25 → 0.5 (acceptance tuning, 2026-07-01): at 0.25 half the session seeds settled in a
    // "double-ray" basin (starts on an origin ray ∝ rank, ends on a ray ∝ value, angles scattered —
    // division of labor perfect but ungrounded/unparallel). The two basins are score-equivalent at
    // their endpoints under every admissible knob, so the ink weight works through the DYNAMICS:
    // from a random init a stronger ink term quiets meaningless variation (angles, stray lengths)
    // before the relations pick carriers, biasing basin selection toward grounded/parallel figures.
    spuriousness: 0.5,
    frozenDof: 0.0, // Var(baseline) + circularVar(tilt): unassigned DOF should not vary (registered, off)
    economy: 0.0, // count of posited frames / active measurements (Occam pressure; registered, off)
  },

  // ── Optimizer: Adam hyperparameters (CONCEPT §9) ─────────────────────────
  adam: {
    lr: 0.05,
    beta1: 0.9,
    beta2: 0.999,
    eps: 1e-8,
  },

  // ── Evolution / multi-start outer layer (CONCEPT §9; optimizer v2) ────────
  // v2 ("let each evolution play out"): populationSize INDEPENDENT trajectories — no champion
  // adoption, no mid-run culling. Each trajectory runs its own Adam state, its own anneal clock,
  // and its own plateau detector; when it plateaus (or hits the live per-trajectory step cap) it
  // FREEZES as an endpoint and its slot starts a replacement trajectory, until the restart budget
  // is spent. The session result is the best endpoint by exact score.
  evolve: {
    populationSize: 4, // parallel independent trajectory slots (comprehensive score is heavy)
    mutationSigma: 0.2, // mutation-restart perturbation scale, as a fraction of the init-box width
    // Fraction of replacement trajectories seeded by MUTATING the best endpoint so far (exploit);
    // the rest are fresh random restarts (explore). Interleaved deterministically (0.5 alternates
    // fresh, mutant, fresh, …), so both kinds occur at any budget ≥ 2.
    mutateFraction: 0.5,
    maxRestarts: 20, // the restart budget: total replacement trajectories per session
  },

  // ── Convergence detection: SCORE plateau, not param fixity (CONCEPT §9) ───
  // The optimum is a valley (scale/translation invariant) so params drift forever;
  // we watch the score window's spread instead. v2: detection is PER TRAJECTORY.
  converge: {
    windowSize: 80, // v2: longer window — the LSE objective's plateaus are slower/noisier than v1's sums
    plateauEps: 1e-4, // absolute: max(window) − min(window) below this ⇒ plateau (near-zero scores)
    plateauRelEps: 3e-4, // relative: spread / |mean| below this ⇒ plateau (adapts to the score scale)
    minSteps: 100, // never declare convergence before this
    maxSteps: 5000, // per-TRAJECTORY hard step cap; initial value of the live GUI control (session.setMaxSteps)
    maxTotalSteps: 200000, // GLOBAL session cap on step() calls — a safety net that force-finishes everything
    qualityThreshold: 0.9, // normalized score to count a converged run as "success" (bench)
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

  // ── Scoring mode ──────────────────────────────────────────────────────────
  // 'comprehensive' (default): each data relation is scored against ALL commensurable measurements,
  //   summed — the full-matrix homomorphism (sales → 20 ratio-comparable, order → all 26).
  // 'fixed': collapse each relation to a single configured carrier (the earlier bar-chart-only model).
  scoring: 'comprehensive' as 'comprehensive' | 'fixed',

  // ── Assignment policy default (CONCEPT §7: only used in 'fixed'/invention modes) ─
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
  stepsPerFrame: 4, // inner optimizer steps per animation frame (comprehensive score is ~10× heavier)
};
// NOTE: no `as const` — fields keep plain number/string types so the user (and tests / the optimizer)
// can override weights, penalty weights, and hyperparameters by spreading a modified copy.

export type Config = typeof config;
