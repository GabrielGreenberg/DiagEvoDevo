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
    // 2.0 → 2.5 (near-miss softening, 2026-07-02): the interval rung is "value decodable up to an
    // affine anchor" — exactly what an UNGROUNDED position reading of proportional bars provides
    // (c = k·v + b scores r² = 1). Cleveland–McGill puts position on a common scale at the TOP of
    // the perceptual decoding hierarchy, so such readings are genuine value backups for a reader
    // and deserve more of the ladder than v2 gave them. 2.5 preserves BOTH orderings:
    // w_ord < w_int < w_ratio (tested invariant) and w_ord + w_int < w_ratio — the ratio rung
    // still outweighs everything below it combined, so full proportionality stays the dominant
    // target and an affine near-miss earns (1+2.5)/7.5 = 47% of a cell, not parity.
    w_int: 2.5,
    w_ratio: 4.0,
  },

  // ── Ladder surrogate parameters ──────────────────────────────────────────
  // T: dimensionless logistic temperature for the differentiable F_ord surrogate. The margin is
  // normalized by spread(c) (floored at the legibility scale, see `legibility`), so T is scale-free
  // (→ exact F_ord as T→0). This is the FINAL (annealed-to) temperature; the optimizer anneals T
  // from anneal.tStart down to this value (see below).
  T: 0.1,
  // σ₀² in F_ratio = exp(−Var(log|c| − log v)/σ₀²) · coh(c) (v2 signed-safe form, CONCEPT §6).
  // σ₀ is the reader's PROPORTIONALITY TOLERANCE in log units: how much per-item log-ratio scatter
  // still reads as "roughly proportional" (the Weber-fraction home — ratio estimation is coarse,
  // so moderate log-space mismatch is perceptually a near-miss, not a fail).
  // 1.0 → 2.0 (near-miss softening, 2026-07-02): at 1.0 the grounding-relevant near-miss — an
  // ungrounded position reading of proportional bars, c = k·v + b, which a reader decodes fully
  // once the axis is anchored (τ_sym = 1, r² = 1) — kept only 2–6% of a perfect carrier's LSE
  // gradient share for b = 25–100% of the span (measured, scratch/tune_cliff_probe.ts), so the
  // ratio-base pull that grounds a baseline onto the frame axis (b → 0) never engaged. At 2.0
  // (with β = 8 below) those readings retain ~13–46% — material pressure to finish the job —
  // while true proportionality stays the STRICT optimum (base < 1 whenever Var(d) > 0; the
  // power-law-warp regression still passes). Offline calibration (scratch/tune_grid.ts): all
  // gate-1 ranking margins stay ≥ 0.74 for σ₀² ∈ [1,3] (ranking is insensitive here); 2.0 leaves
  // headroom before random-figure quality drifts against its pinned ceiling (σ₀² ≥ 2.5 does not).
  sigma0Sq: 2.0,

  // ── v2 aggregation: within-relation smooth-max (CONCEPT §6, scoring-v2 design) ──
  aggregation: {
    // β: LSE sharpness in relation(R) = (1/β)·log(mean_m exp(β·q_m)). One excellent carrier
    // dominates the relation; every additional matching carrier still STRICTLY raises it (the
    // "more matches wins" bonus is monotone, no longer a linear trade against perfection).
    // β→∞ = hard max, β→0 = plain mean. Also the data-ink penalty's smoothmax temperature.
    // 10 → 8 (near-miss softening, 2026-07-02): β is how winner-take-all the reading competition
    // is — a carrier's share of the relation's gradient is ≈ e^{β(q − q_max)}, so β sets the
    // perceptual band of "still in contention". At 10, a near-miss q-gap of 0.35 starves to ~3%;
    // at 8 it keeps ~6% and the calibrated near-misses (offset-linear/curved/noisy carriers, see
    // sigma0Sq above) land at 13–46% of a perfect carrier's share. HARD FLOOR: β must keep "one
    // perfect carrier beats many mediocre ones" (accept gate 2's q = 0.6 cohort): β = 8 passes
    // with margin 0.09, β = 6 FAILS — do not go below 8 without revisiting that gate's math.
    beta: 8,
    // matchBonus (default true): HOW a relation aggregates its per-carrier cells q_m.
    //   true  — mean-form LSE (the v2 default above): one excellent carrier dominates AND every
    //           additional matching carrier still STRICTLY raises the relation ("correlational
    //           doubling" is credited — independent readings tracking the same relation are worth
    //           reward). Gate 2's monotonicity invariants (scripts/accept.ts) assume THIS form;
    //           gates run at defaults, so they only apply when matchBonus = true.
    //   false — best-carrier-only smooth aggregation: the softmax-weighted mean
    //           q̄ = Σ_m q_m·e^{β·q_m} / Σ_m e^{β·q_m}  (same β, smooth, ≤ max q).
    //           A single perfect salient carrier ⇒ relation ≈ 1 (its weight e^β dwarfs the rest),
    //           and a second perfect carrier adds < 0.01 (perfect entries already own the weight).
    //           TRADE-OFFS (documented honestly): unlike the LSE this form is NOT monotone in
    //           every cell — ∂q̄/∂q_j < 0 whenever q_j < q̄ − 1/β, so adding or slightly improving
    //           a MEDIOCRE carrier DILUTES the relation (it gains softmax weight faster than it
    //           contributes value). That is the intended semantics ("only the best reading
    //           counts") but it removes the smooth "more matches wins" pressure the LSE supplies.
    //           Only the RELATION aggregation switches; the data-ink penalty's smoothmax_R and the
    //           coincidence bonus's pair aggregation stay mean-form LSE (they are max-flavored
    //           already and their invariants depend on LSE bounds).
    matchBonus: true,
  },

  // ── Coincidence bonus (2026-07-02, user-agreed brief): rewarding ARRANGED equality ────────────
  // Extends the CONCEPT §6 ladder with EQUALITY — the rung above ratio — applied at the §7
  // aggregation layer (CONCEPT.md section pending; this comment is the working spec).
  // Beyond correlational doubling (two readings independently tracking a relation — already
  // credited by the mean-LSE), the figure can ARRANGE two reading procedures to return the SAME
  // NUMBER in the SAME page units (grounded vertical bars make end-y ≡ rise ≡ length; verticality
  // makes start-x ≡ end-x ≡ mid-x). Equality = proportionality + shared zero + shared unit — the
  // rung above ratio: mutual calibration (this is what an axis is), free redundancy (no extra
  // ink), perceptually verifiable ("commuting readings"). WEAK version: same-magnitude equality
  // of the 12-vectors; the strong same-ink/path version is future work. Definitionally-equal
  // readings are already MERGED by the carrier dedup (registry.carriers), so only ACHIEVED,
  // figure-dependent identity can ever form a pair — a merged class is one carrier, never a pair.
  // Per relation R, over unordered pairs (m1,m2) of R's commensurable distinct carriers with the
  // SAME unit class:
  //   eq(c1,c2)   = exp( −mean_i (c1ᵢ−c2ᵢ)² / (2·σ_eq²) )       (σ_eq per unit class, ABSOLUTE)
  //   pairScore   = eq(c1,c2) · q1^p · q2^p                       (q already includes salience)
  //   relationCoin(R) = mean-form LSE over pairScores (same aggregation.beta): the best pair
  //                     dominates, extra coincident pairs still add
  //   bonusTotal  = weight · Σ_R relationCoin(R)
  //   total       = reward + bonusTotal − penalty  (quality stays reward/#relations; the bonus is
  //                                                 shown separately in the breakdown)
  bonuses: {
    coincidence: {
      // Overall weight of the bonus. 0 disables the term ENTIRELY on both paths — no pair nodes
      // are built on the tape and the exact breakdown reports empty pair lists.
      // 0.3 → 0.2 (acceptance tuning, 2026-07-02 adversarial verification): like the data-ink
      // weight, this knob works through the DYNAMICS (basin selection), and at 0.3 full-depth
      // sessions on figure seeds 1 and 5 left the legible basins their w=0 controls reach for two
      // coincidence-stabilized traps — a DOT PLOT (seed 5: every segment collapses to a point, so
      // start≡mid≡end coincide in BOTH axes "for free"; the weak same-magnitude eq cannot tell
      // axis-collapse from arranged commuting readings) and MID-ANCHORED bars (seed 1: the single
      // pair mid-y ≡ length locks a bar family floating at half height, and the pair-LSE's
      // best-pair dominance gives too little marginal pull toward the 3-pair grounded stack
      // end-y ≡ rise ≡ length). Both traps score ≈1.74, above the legible combs (≈1.58) though
      // far below true grounded bars (1.91). At 0.2 all six full-depth seeds end LEGIBLE (6/6,
      // the pre-feature level) and the earned coincidences are the intended ones (axis grounding,
      // shared-unit calibration); every static gate-1 margin passes at ANY weight in [0, 0.3]
      // (margins are linear in the weight and pass at both ends — verified). The collapse
      // loophole itself is inherent to the WEAK equality version and is the first thing the
      // strong same-ink/path version should close.
      weight: 0.2,
      // σ_eq for 'length'-class pairs, in PAGE UNITS. Absolute (not relative) on purpose: equality
      // in shared page units is the whole point — consistent with salience's absolute θ_len. Two
      // readings differing by ~σ_eq per item still read as "the same number"; a 2× scale mismatch
      // at page scale reads as different numbers (eq ≈ 0), leaving a smooth convergence gradient.
      sigmaEqLen: 5,
      // σ_eq for 'angle'-class pairs, in RADIANS (bearings/tilts). Compared by plain difference of
      // atan2 values — like ordinal-from-bearings, the ±π branch cut is a documented limitation.
      sigmaEqAngle: 0.1,
      // p: the fidelity gate exponent — pairScore is gated by q1^p·q2^p so only pairs of carriers
      // that BOTH genuinely carry the relation (and are salient: q includes the salience gate) can
      // earn coincidence credit. Equal-but-meaningless (or equal-but-constant) readings earn ~0.
      // Keep p ≥ 1: the pow gradient p·q^(p−1) must stay finite at q = 0.
      fidelityGateP: 2,
      // mode (CONCEPT §7): WHAT counts as a coincidence of two readings.
      //   'weak'   — same-magnitude equality of the 12-vectors (the formula above, unchanged; the
      //              shipped, acceptance-validated v2.2 behavior — hence the default). Its verified
      //              blind spot: it cannot distinguish an AXIS (identity by construction — two
      //              reading procedures arranged to trace the same ink) from a COLLAPSE (identity
      //              by degeneration — a segment shrunk until start ≡ mid ≡ end for free): the
      //              dot-plot and mid-anchor traps in the weight comment above.
      //   'strong' — same-INK-PATH equality: pairScore = eq · strongOverlap · q1^p · q2^p, where
      //              strongOverlap = mean_i( ov_i · g_i ) requires each item's two MEASUREMENT
      //              PATHS (the ruler each reading procedure lays on the page — see
      //              measurements/paths.ts) to coincide as ink (ov_i, σ_path below) AND the item's
      //              segment to have visible extent (g_i, θ_ink below). Everything else — the pair
      //              set, eq, the q-gate, the pair-LSE, the weight — is IDENTICAL to weak: strong
      //              = weak × alignment × ink. Angle-class pairs have no linear ink-path and keep
      //              the weak formula in strong mode (their strong theory awaits arcs; documented
      //              in paths.ts).
      mode: 'weak' as 'weak' | 'strong',
      // σ_path (page units): the ink-alignment tolerance of the strong overlap kernel
      //   ov_i = exp( −min(‖A₁−A₂‖²+‖B₁−B₂‖², ‖A₁−B₂‖²+‖B₁−A₂‖²) / (2σ_path²) )
      // (smooth min via smoothAbs, orientation-symmetric: a path traced backwards is the same
      // ink). Two paths whose endpoints sit within ~σ_path still read as the same ruler; a
      // baseline floating b units off the axis decays as exp(−b²/2σ_path²) — the smooth
      // axis-seeking gradient. Same absolute-page-units stance as sigmaEqLen.
      sigmaPath: 5,
      // θ_ink (page units): the ink gate g_i = ‖disp_i‖² / (‖disp_i‖² + θ_ink²) — a pair's overlap
      // on item i counts only in proportion to that segment's visible extent. THE collapse killer
      // (CONCEPT §7 caveat ii): a segment shrunk to a point has every point-reading path
      // trivially coincident, and g_i = 0 refuses it all; a bar taller than ~θ_ink keeps g ≈ 1.
      // Scaled like the reader-resolution θ_len (salience) but deliberately at the sharper
      // σ-scale: ink smaller than the equality tolerance itself proves nothing.
      thetaInk: 5,
    },
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
    // v2.2: ALSO guards fIntCirc's denominators (Vv+ε and the (cos,sin) covariance determinant
    // Vc·Vs−c²+ε): a near-constant or rank-1 bearing carrier gives R² → 0 smoothly, never NaN.
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
  //   summed — the full-matrix homomorphism. v2.2 (ratio ≤ cyclic restored): sales → all 20
  //   ratio-or-cyclic raw cells (16 distinct carriers under the v1 geometry), order → all 26 (16
  //   distinct). No reading is structurally blocked from any relation; exclusions only via
  //   carriers.disabled below.
  // 'fixed': collapse each relation to a single configured carrier (the earlier bar-chart-only model).
  scoring: 'comprehensive' as 'comprehensive' | 'fixed',

  // ── Carrier toggles (exploration knob; GUI "readings" strip) ──────────────
  // Canonical distinct-carrier ids (or any of their merged-away aliases) to EXCLUDE from the
  // census. Exploration knob: excluded readings vanish from the census — both relations'
  // candidate sets, the LSE means, the data-ink mean, and the panel all follow (every consumer
  // normalizes by the census it is given, so counts shrink together). `quality` keeps its
  // denominator #relations — honest: if you turn off everything value-readable, value can't
  // encode and quality says so. In 'fixed' scoring mode a disabled id that resolves one of the
  // configured fixedCarriers is IGNORED for that carrier (the fixed objective needs it to exist).
  carriers: {
    disabled: [] as string[],
  },

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

  // ── GUI display knobs ─────────────────────────────────────────────────────
  ui: {
    // The gallery's permanent REFERENCE cell: a hand-built golden bar chart of the session's
    // dataset (core/fixtures.loudGoldenBarChart), scored under the session's snapshotted objective
    // so it can be compared against the evolved trajectories on any run. Display-only benchmark —
    // never steps, never Saved, never the ★ best. Set false to hide the cell entirely.
    showReferenceBars: true,
  },
};
// NOTE: no `as const` — fields keep plain number/string types so the user (and tests / the optimizer)
// can override weights, penalty weights, and hyperparameters by spreading a modified copy.

export type Config = typeof config;
