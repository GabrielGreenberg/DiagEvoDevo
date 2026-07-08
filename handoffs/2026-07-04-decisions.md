# Decision record — the v2 arc (audit → v2.1 → v2.2 → circular rungs → strong coincidence)

Why the score, the optimizer, and the discipline are what they are. Numbers are quoted from
`PROGRESS.md` and the acceptance/scratch logs, never from memory. Read this when a next-action
would touch a decision recorded here; otherwise it is a reference, not required reading.

---

## 1. The audit verdict — why v1's objective failed (2026-07-01)
An **87-agent adversarial audit** (every finding confirmed by ≥2/3 independent verifiers with
numeric reproductions; ~110 scripts preserved in `scratch/`, reused as probes, never modified)
proved the v1 *objective* preferred illegible figures while the optimizer was sound. Headline
numbers:
- Hand-built "everything ∝ value" mush **outscored perfect bars 1.40 vs 1.17/2.0**, and Adam
  walked AWAY from perfect bars — the linear sum had **zero division-of-labor pressure**
  (compromise frontiers summed to constants; sales outbid order on every carrier, marginal
  **0.041 vs 0.019**, so the optimum gave order ZERO carriers).
- Fidelity was **resolution-free**: a certified τ=0.97 order carrier spanned 21 units under
  109-unit segments (the score vouched for an encoding no reader can see).
- `fOrd`'s 1/spread normalization **exploded gradients ~1e8×** on flat carriers; `fRatio`'s
  positivity clamp paid all-negative carriers a free, gradient-dead ≈**0.18** (15/20 sales
  carriers signed); r²'s sign-blindness broke rung nesting (anti-plateaus); cyclic-on-top hit
  branch-cut cliffs (**reward 5.56 → 0.84 for a 0.002 rad rotation**).
- 10 of 26 measurements were exact duplicates (**16 distinct**); hidden chance floors made
  random figures read ~33% quality / order ~50%; all penalties were weight-0 (pick-up-sticks
  optima); and the evolve machinery was dead (`adoptMargin` never fired, mutation branch dead
  at pop 4, restart knobs inert).

**Verdict:** rebuild the objective (not the optimizer's search), and rebuild the optimizer's
*machinery* (which was dead code, not a bad search strategy).

## 2. Scoring decisions + rationale

**LSE aggregation (β=8), not a sum.** Within each relation, aggregate the deduped carriers'
cells by a mean-form log-sum-exp smooth-max: relation ∈ [min q, max q], strictly increasing in
every q_m. This makes (a) one perfect carrier dominate its relation (no dilution by mediocre
carriers), (b) each additional match a strict-monotone *bonus* (the user's "more matches wins",
kept — but no longer a linear trade against perfection), and (c) **division of labor an
optimum** (each relation satisfied by its best carriers; carriers the other relation needs are
cheap to cede). This is the direct fix for the audit's mush optimum. `reward = Σ_R relation(R)`;
`quality = reward / #relations` (≈0 for random figures).

**Salience gate as the reader model.** `s(c) = Var(c)/(Var(c)+θ²)`, absolute θ per unit class
(θ_len page units, θ_ang radians). Fidelity is scale-invariant hence resolution-free; the gate
is where legibility enters — a carrier below the reader's resolution earns ≈0 and (§8) is not
worth ink. This is the principled home of the M10 Cleveland–McGill anchor (calibrate θ per
reading class, don't hand-tune weights).

**Direction-symmetric, chance-honest rungs.** Legibility is decodability *up to axis direction*
(a reversed/mirrored axis is legible). Ordinal = `τ_sym = |2·F_ord − 1| = |Kendall τ|` (0 at
chance and on constants, 1 monotone either way), with the surrogate margin spread-normalized
but **floored at the legibility scale** ℓ_min per unit class — this floor kills BOTH the 1e8
gradient explosion AND the sub-pixel-order loophole (compressed order reads as ties). Interval
= r² (chance 1/(n−1)≈0.09 accepted, documented). Ratio = `base·coh`, **signed-safe** (v2.1
blocker fix below). No hidden chance floors: random/constant carriers ≈0 on every rung.

**Signed-safe ratio (the v2.1 blocker fix, `ladder.ts`).** The v2.0 spec's spread-relative sign
test capped a perfect proportional carrier at ~0.68 and made a power-law warp (c ∝ v^0.78) the
optimum. Fix: normalize each entry's sign test by its v-implied magnitude κ·ŝ·vᵢ and divide out
the derived ceiling tanh(1/(2κ)), so **F_ratio = 1 exactly iff c = ±k·v** and proportionality
is a stationary point of coh (the optimizer does not warp perfect bars). κ (0.2) is a sharp
sign test, not a magnitude tolerance; the ceiling is derived, never tuned.

**Structural dedup.** 26 census cells → **16 distinct** under v1 geometry (12 ratio + 4 cyclic);
sales→12 (now 16 with circular rungs restored), order→16. Rules are structural, so they survive
frame movement (M8). Plain-English labels everywhere (`start x`, `run`, `length`, `fr·mid dist`).

**Cyclic demotion THEN restoration.** v2 first DEMOTED cyclic (reads-down = ordinal ≤ interval ≤
ratio, and ordinal ≤ cyclic only) because raw-atan2-in-linear-stats was unsound (the ±π cliff,
mirrored dials ≈0). v2.2 RESTORED the full chain **ordinal ≤ interval ≤ ratio ≤ cyclic** by
fixing the rung FORMS at the correct layer, routing by unit class (`rungs.ts`):
- interval-on-angles = **Mardia circular–linear R²**, computed sqrt-free as
  (a²Vs+b²Vc−2abc)/((Vv+ε)(VcVs−c²+ε)) — wrap-invariant (cos/sin reads, no cliff),
  rotation-invariant (dial zero = interval's affine anchor), direction-symmetric, ∈[0,1]. Perfect
  dial ≈1 (0.9948 at 2.5 rad; 0.953 at 4 rad where linear r² collapses to 0.05).
- ratio-on-angles = v2.1 `fRatio` UNCHANGED (√(θ²+ε) continuous across the cut; the side-flip
  when an item crosses |θ|=π is localized & bounded: measured Δcell 1.000 of max 7.5, Δtotal
  0.073, vs v1's Δ4.72 relation collapse).
- ordinal-on-angles = raw form; its localized branch-cut misread stays a documented limitation.
User directive 2026-07-03: dials/gauges are legitimate; **NO reading is structurally blocked from
any relation** — only the manual Readings toggles exclude.

**Antipodal-cancellation fix (circular rungs, second adversarial pass).** `fIntCircExact` had NO
ε-guard (unlike its Value twin) and the sqrt-free Mardia det `Vc·Vs − c²` is a cancellation magnet
at rank-1: exactly-antipodal bearings (θ ∈ {0,π}) left det as float noise that could return
**R² = 1.476 > 1**, breaking ∈[0,1] AND lockstep, reproduced end-to-end through `scoreExact`
(a real poisoning channel: scoreExact drives every gate ranking, endpoint selection, the
characterizer). Fix: ε-guard `fIntCircExact` with the same denominators as `fIntCirc`
(the `fRatioExact` precedent). Regression: 24 antipodal side-patterns × both paths ≤ 1e-6.

**Near-miss softening knobs (user-directed).** Stop crushing almost-perfect readings; make
convergence strictness hand-editable. Cliff diagnosis: the crushed case was OFFSET-LINEAR
position readings (τ=1, r²=1, yet only 2–6% of a perfect carrier's gradient share). Knobs (config
comments carry the perceptual rationale): `sigma0Sq` 1→2 (Weber tolerance), `beta` 10→8
(**β=6 REJECTED** — fails gate-2 one-perfect-beats-many; documented floor), `w_int` 2→2.5
(offset-position readings are value-decodable per Cleveland–McGill; keeps w_ord<w_int<w_ratio and
w_ord+w_int<w_ratio). Offset readings then got 13–46% gradient share; acceptance fixtures made
LOUD (golden spacing 10→100). Result: 49/49, DOL 6/6, legible 6/6 (was 5/6).

**Coincidence weak → strong (the arc's centerpiece).** Beyond correlational doubling (mean-LSE
already credits independent readings tracking a relation), the score rewards **coincidence**: a
figure ARRANGING two reading procedures to return the same number in the same page units
(equality = proportionality + shared zero + shared unit — the rung above ratio; mutual
calibration, free redundancy, commuting readings — an axis in embryo).
- **Weak (same-magnitude)**: pairScore = eq·q₁ᵖq₂ᵖ, eq = exp(−mean(Δ²)/2σ_eq²), σ_eq absolute per
  unit class, aggregated by the same mean-LSE; total = reward + w·Σ_R relationCoin − penalty
  (bonus OUTSIDE quality so legibility comparisons stay interpretable). Definitionally-equal
  readings never pair (dedup merged them); only ACHIEVED identity earns.
- **THE COLLAPSE TRAP STORY.** At weight 0.3, full-depth optimization on seeds 1 and 5 LEFT their
  legible w=0 basins for two coincidence-stabilized traps: a DOT PLOT (seed 5 — collapsing every
  segment makes start≡mid≡end coincide in both axes; weak same-magnitude eq cannot tell
  axis-collapse from arranged commuting readings) and MID-ANCHORED bars (seed 1 — the lone pair
  mid-y ≡ length locks bars floating at half height). Both ≈1.74 (above legible combs ≈1.58, below
  golden ≈1.91); legibility regressed 6/6 → 4/6. **Fix at the config layer** (the knob works
  through basin-selection dynamics, exactly like the data-ink 0.25→0.5 precedent): weight
  **0.3 → 0.2**. At 0.2 all six full-depth seeds end LEGIBLE. The collapse loophole is inherent to
  the WEAK version.
- **THE INK-PATH RESOLUTION (strong version).** The principled fix: a reading procedure actually
  performed traces ink — its **measurement path**, a segment derived structurally from
  (anchor, part, reading) against `cfg.frame`/`cfg.page` (survives M8). Catalogue in
  `measurements/paths.ts` (point x = ruler from perp axis; point y = plumb from frame axis;
  fr·dist = radial ruler from O; length = the ink; run/rise = dogleg legs, **parallel leg first**).
  Strong pairScore = eq · strongOverlap · q₁ᵖq₂ᵖ, strongOverlap = mean_i(ov_i·g_i): ov = smooth
  orientation-symmetric endpoint kernel (σ_path), g = ink gate ‖disp‖²/(‖disp‖²+θ_ink²) — **THE
  collapse killer** (a point's coincident paths prove nothing). **Strong = weak × alignment ×
  ink.** Executed: at w=0.3 the traps' weak bonuses ≈ golden's (0.201 vs 0.226 — the blind spot);
  under strong the dot plot → 0.0008 (gate zeroes every pair), mid-anchor → 0.031 (residue is the
  LEGITIMATE rise≡length, not the trap mid-y≡length which is path-killed, ink 0.09) while golden
  keeps 0.088 and outranks both statically. Angle pairs (arcs) and origin-free page-point
  projections keep the weak formula (no linear ink-path; documented). Config:
  `bonuses.coincidence.mode` (off/weak/strong), `sigmaPath: 5`, `thetaInk: 5`, commented.
- **PROMOTION to strong/0.2 as the certified default** (this arc's final commit). See §5.

**matchBonus switch** (`aggregation.matchBonus`, default true): false switches relations to
best-carrier-only softmax-mean aggregation (single perfect ⇒ ≈1; second perfect adds <0.01;
documented non-monotone dilution trade-off — an experiment lens on how much emergent structure
is owed to independent doubling). Both code paths in lockstep; bit-exact with the default path.

**Data-ink penalty** (`spuriousness`, ON at 0.5): mean_m s_m·(1−smoothmax_R q_m) over the FULL
distinct carrier set in BOTH modes — salient variation carrying no relation is fabricated
structure. Supplies the grounding/parallelism/quiet-DOF pressure the audit found missing.
`frozenDof`/`economy` stay registered at weight 0.

## 3. Optimizer redesign (user directive: "let each evolution play out")
The audit found the evolve machinery dead. Replaced (not tuned): **multi-start, no adoption, no
mid-run culling.** `populationSize` independent trajectories, each with its own Adam state, anneal
clock, plateau detector; a trajectory that plateaus (or hits its per-trajectory cap) FREEZES as an
endpoint; freed slots start replacements (alternating fresh-random / mutation-of-best-endpoint,
`evolve.mutateFraction`) until `maxRestarts` exhausted; session result = best endpoint by exact
score. `adoptMargin` dropped, mutation branch live, restart knobs real. Owns gate 5 of accept.

## 4. The user's standing mandates (do not re-litigate)
- **Plain-English labels everywhere** (`start x`, `run`, `length`, `fr·mid dist`, …).
- **Chance-corrected, honest scores** — quality ≈0 for random figures; no hidden chance floors.
- **No auto-switching displays** — the panel never silently changes what it shows.
- **Results persist until Reset** — nothing clears at 'done'; only Reset/new-seed clears.
- **Nothing structurally blocked** — only the hand Readings toggles exclude readings from
  relations (dials/gauges are legitimate encodings).
- **Watch evolutions play out** — independent trajectories, frozen endpoints, no mid-run culling.
- **Discover kinds, never hard-code bars** — the bar chart is only the checkable-by-hand target;
  the score is a formal homomorphism theory.
- **Deep over patches** — the deepest correct layer, always (Principle I).

## 5. The softened-choice ledger (all user-ratified)
Changes from Gabriel's earlier choices, flagged not silently dropped:
1. **"Sum within a relation" → LSE.** The monotone more-matches bonus is kept; the linear trade
   (confirmed root cause of the mush optimum) is removed.
2. **"Order readable from angles / cyclic on top" → ordinal ≤ cyclic only (v2), then FULLY
   RESTORED (v2.2).** The intent (bearings carry order, and ratio/interval) is kept; only the
   unsound raw-bearing implementation was removed, then replaced with sound circular forms.
3. **Coincidence weight 0.3 → 0.2** (collapse-trap basin selection; the data-ink precedent).
4. **Default coincidence mode weak → strong** (structural closure of caveat (ii); certified).
Choices retained in force: per-relation normalization; frame fixed at the page origin (until M8).

## 6. Certification discipline (the acceptance IS the certificate)
- **A feature is done when adversarial tests that try to falsify its invariants pass** —
  verification is the approval (Principle II working mode). Every scoring term/measurement/weight
  is a registered swappable unit with its params in `config`.
- **`npm run accept` (full) is the certificate of record.** The certificate now refers to
  **strong/0.2**: 49/49 checks, DOL 6/6, LEGIBLE 6/6. `--quick --seeds=1,2` is a smoke test only
  (its gate-5 tally is a documented `--seeds` arithmetic artifact; the 1200-step cap misses
  legibility even at w=0).
- **The promotion procedure used for strong** (repeatable): run full accept under the candidate
  default → recompute every default-config test pin via a probe script
  (`scripts/probe_promotion_repin.ts`), NEVER by guessing → keep old-default pins alive under an
  EXPLICIT mode override (byte-identical) → add honest new-default supplements next to them →
  flip the config default → re-run all gates (check/build/gradcheck/accept). No invariant is
  weakened in a promotion; the pins move to honest values, the guarantees do not.
