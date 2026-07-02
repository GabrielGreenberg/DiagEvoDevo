# PROGRESS.md — Living State

Single source of truth for *where we are*. Read this first every session; append to it in
the same session that work happens. Never reconstruct state that belongs here.

---

## Status: ✅ v2 — audit-driven redesign of the objective, optimizer, and UI (2026-07-01). Gates: `npm run check` + `npm run accept`.

CONCEPT.md §§5–8 and ARCHITECTURE.md are canonical for the v2 math; the build spec
(`handoffs/2026-07-01-scoring-v2-design.md`) is now a historical record.

### Acceptance run (2026-07-02): 49/49 checks green, division of labor 6/6
Full `npm run accept` (default knobs, no tuning needed): golden bars 1.506 vs every audit-winning
degenerate 0.75–0.84, random ×50 median NEGATIVE, label-ordered > value-sorted, characterizer
calibrated (legible fixtures legible, 0/50 randoms legible). Gate-5 sessions (multi-start optimizer,
seeds 1–6 × data 1, ~6.5 min/seed): **6/6 division of labor** (every seed: some salient carrier
τ_sym = 1.00 for order AND some salient carrier ratio ≈ 1.00 for sales), 5/6 characterized LEGIBLE,
quality 0.84–0.85, ink 0.06–0.08. **Distinct diagram KINDS emerged as optima** (nothing hard-coded):
seed 1/3/5 a "spoke/comet" plot (order = start-distance-from-frame-origin, value = end-distance);
seed 2 horizontal ticks (order = end-x, value = end-y); seed 4 grounded near-vertical bars
(order = rise, value = start-distance). Several beat the golden bar chart (0.796) — the mission's
"discover kinds as optima" behavior. Live GUI verified same-day: honest headline (random figure
total ≈ −0.02), trajectory strip with independent played-out runs (no resets), fixed viewport
(frame no longer appears to move), plain-English labels, per-rung mini-bars, live max-steps control.

### Near-miss credit + elastic convergence (2026-07-02, user-directed): 49/49, legibility 6/6
User asked to (a) make convergence strictness hand-editable and (b) stop crushing "almost-perfect"
readings. Cliff diagnosis (scratch/tune_cliff_probe.ts): the crushed case was OFFSET-LINEAR position
readings (τ=1, r²=1, yet 2–6% of a perfect carrier's gradient share) — exactly the reading that must
walk to the baseline to produce doubled-up sales carriers. Knobs (config comments carry the
perceptual rationale): sigma0Sq 1→2 (reader's proportionality tolerance, Weber home), beta 10→8
(β=6 REJECTED — fails gate-2 one-perfect-beats-many; documented floor), w_int 2→2.5 (offset-position
readings are value-decodable per Cleveland–McGill; keeps w_ord<w_int<w_ratio and w_ord+w_int<w_ratio).
Offset readings now get 13–46% gradient share. Acceptance fixtures made LOUD (golden spacing 10→100).
Full `npm run accept` at new knobs: **49/49, division of labor 6/6, legible 6/6** (was 5/6); every
seed now converges to GROUNDED PARALLEL bars/ticks; sales carried by 2–4 salient ≥0.9 readings per
seed (was ~1) via grounding coincidences. Extent readings (length/rise/run) take order duty in these
optima; the specific length+position sales pairing hasn't emerged yet — next lever is M8 (free the
frame), awaiting user green-light. UI: "plateau eps" input (live via session.setPlateauRelEps,
persisted in prefs like max steps; smaller = stricter = runs continue longer).

### The audit (2026-07-01)
An 87-agent adversarial audit (every finding confirmed by ≥2/3 independent verifiers with numeric
reproductions; ~110 scripts preserved in `scratch/` — reuse as probes, never modify) proved the v1
comprehensive OBJECTIVE preferred illegible figures while the optimizer was sound: hand-built
"everything ∝ value" mush outscored perfect bars 1.40 vs 1.17/2.0 and Adam walked AWAY from perfect
bars; the linear sum had zero division-of-labor pressure (compromise frontiers summed to constants;
sales outbid order on every carrier, marginal 0.041 vs 0.019 → the optimum gave order ZERO
carriers); fidelity was resolution-free (a certified τ=0.97 order carrier spanned 21 units under
109-unit segments); fOrd's 1/spread normalization exploded gradients ~1e8× on flat carriers;
fRatio's positivity clamp paid all-negative carriers a free, gradient-dead ≈0.18 (15/20 sales
carriers signed); r²'s sign-blindness broke rung nesting (anti-plateaus); cyclic-on-top hit
branch-cut cliffs (reward 5.56→0.84 for a 0.002 rad rotation); 10 of 26 measurements were exact
duplicates (16 distinct; 16 projection rows of rank 4); hidden chance floors made random figures
read ~33% quality / order ~50%; all penalties were weight-0 (pick-up-sticks optima); and the evolve
machinery was dead (adoptMargin never fired, mutation branch dead at pop 4, restart knobs inert).

### Scoring v2 (v2.1) — shipped
The redesigned objective per the spec, with the one confirmed review blocker fixed (v2.1):
- **Rungs — chance-corrected, direction-symmetric** (a reversed axis / mirrored encoding is
  legible). Ordinal = τ_sym = smooth |2·F_ord−1| with the surrogate margin floored at the
  legibility scale per unit class (kills the 1e8 explosion AND the sub-pixel loophole — sub-legible
  order reads as ties); interval = r² (chance 1/(n−1)≈0.09 accepted, documented); ratio =
  signed-safe `base·coh`. **v2.1 blocker fix (ladder.ts):** the sign test is normalized per entry
  by the v-implied magnitude κ·ŝ·vᵢ and the derived ceiling tanh(1/(2κ)), so **F_ratio = 1 exactly
  iff c = ±k·v** and proportionality is a stationary point of coh — the spec's spread-relative test
  capped perfect carriers at ~0.68 and made a power-law warp (c ∝ v^0.78) the optimum. Regression:
  golden bars stay bars (r²(len,v)=0.9995 @ step 2000, gate ≥0.999); F ≤ 1 on 20k random signed
  vectors; ordinal corrective-gradient invariants re-added under τ_sym semantics (incl. the fold
  behavior: mostly-descending carriers push toward FULL reversal).
- **Salience gate** s = Var/(Var+θ²) per unit class — the reader model; the principled home of the
  M10 Cleveland–McGill anchor (calibrate θ per reading class, don't hand-tune weights).
- **LSE aggregation** (β=10) within each relation over the deduped carriers; reward = Σ_R LSE;
  quality = reward/#relations, ≈0 for random figures (chance floors removed at the source).
- **Data-ink penalty** (`spuriousness`, ON at 0.25): mean_m s_m·(1−smoothmax_R q_m) over the FULL
  distinct carrier set in BOTH modes — fixed-mode unassigned carriers pay too (adversarial test:
  fixed-mode pick-up-sticks with identical assigned carriers pays strictly more ink).
  `frozenDof`/`economy` stay registered at 0.
- **carriers(cfg) structural dedup:** 26 census cells → **16 distinct** (12 ratio + 4 cyclic) under
  the v1 geometry; sales→12, order→16; merged cells keep the max stamp + alias list; the rules are
  structural, so they survive frame movement (M8+). Plain-English labels everywhere
  (`start x`, `run`, `length`, `fr·mid dist`, …).
- **Cyclic demoted:** reads-down is `ordinal ≤ interval ≤ ratio` and `ordinal ≤ cyclic` ONLY;
  interval/ratio-from-bearings OFF until genuine circular rung forms exist (registered open
  question); the branch cut on ordinal-from-bearings is a documented limitation.
- `fixed` mode kept on the same v2 ladder for comparability. New config: `aggregation.beta`,
  `salience.thetaLen/thetaAngle`, `legibility.spreadFloorLen/Angle`, `ratioSign.kappa`,
  `penalties.spuriousness=0.25`, `converge.windowSize 50→80`.
- **Verified (scoring pass):** `npm run check` fully green (176 tests), gradcheck green,
  `npm run accept` 25/25 (+12/12 numeric with `--sessions`). Also fixed: vitest worker starvation
  (the long synchronous session test now yields every 200 steps — same trajectory, RNG untouched).

### Optimizer v2 — shipped (user directive: "let each evolution play out")
Multi-start, **no adoption, no mid-run culling**: `populationSize` independent trajectories, each
with its own Adam state, anneal clock, and plateau detector; a trajectory that plateaus (or hits
its per-trajectory cap) FREEZES as an endpoint; freed slots start replacements — alternating
fresh-random / mutation-of-best-endpoint (`evolve.mutateFraction`) — until `maxRestarts` is
exhausted; session result = best endpoint by exact score. Replaces (not tunes) the audit's dead
machinery: `adoptMargin` dropped, mutation branch live, restart knobs real. Gate 5 of
`npm run accept -- --sessions` (seeds 1..6: salient τ_sym ≥ 0.9 for order AND salient ratio ≥ 0.9
for sales, legible dumps) is owned by this pass.

### UI v2 — shipped
Plain-English measurement labels; per-carrier rows with per-rung mini-bars (τ signed ↑/↓, r²,
ratio) + a salience chip; distinct-carrier counts; data-ink penalty row; honest headline
(quality ≈ 0 for random figures); **fixed viewport** (page box + margin, no per-frame refit — the
frame stops "moving"); `byCap` shown live; **trajectory strip** (every trajectory watchable as it
plays out; the main canvas follows the best).

### Softened prior user choices (flagged, not silently dropped)
1. **"Sum within a relation" → LSE.** The monotone more-matches bonus is kept; the linear trade is
   removed (confirmed root cause of the mush optimum).
2. **"Order readable from angles / cyclic on top" → ordinal ≤ cyclic only.** The intent (bearings
   carry order) is kept; the unsound ratio-from-raw-bearing edge is removed until circular rung
   forms exist.
Choices (3) *per-relation normalization* and (4) *frame fixed at the page origin* remain in force.

## Milestone plan

Work top-down through conceptual seams, each sewn in at the deepest level (Principle I),
each closed only when its adversarial tests pass (see `ARCHITECTURE.md §Verification`).

- [x] **M0 — Scaffolding + autograd.** Vite + TS + Vitest; `config.ts`; workflows
      (`dev/test/check/bench/gradcheck`); empty module tree matching `ARCHITECTURE.md`; and the
      foundational `core/autograd` reverse-mode engine (ops + `backward`). Everything downstream
      is written against it. Gate: `check` green on stubs; `gradcheck` passes on every primitive.
      **DONE:** 36 tests green; gradcheck covers all 13 primitives + 9 derived ops + composition +
      self-test (bites on wrong grads) + 50k-node deep graph (iterative topo-sort, no overflow).
- [x] **M1 — Data & Figure.** `data.ts`, `figure.ts`, seed generators, scale metadata.
      Gate: seed→dataset/figure deterministic; property tests on ranges. **DONE:** 13 tests;
      byte-identical determinism, strict positivity, endpoints in box, canonical `[sx,sy,ex,ey]×12`
      accessors, frame constructors + `unit`/`perp` geometry helpers.
- [x] **M2 — Scale & measurements.** `scale.ts`, measurement registry, the 4 readings,
      the 2×4×4 stock with the 6 undefined. Gate: census + coincidence invariants. **DONE:** 20 tests
      (scale 8 + measurements 12); census 15/6/5 counted from the product; undefined-6 exact;
      length anchor-free; run/rise/tilt iff frame∥page; differentiable `extractValue` matches plain
      `extract` on all 26. `ScaleType` enum + 4×4 reads-down table (cyclic isolated), commensurability.
- [x] **M3 — Fidelity ladder.** `fOrd/fInt/fRatio` (differentiable forms written against the
      autograd `Value` type), exact forms for display, rungs + weights, data-capped height.
      Gate: all ladder + nesting invariants. **DONE:** 20 tests; ratio/int/ord invariants, nesting,
      surrogate→exact as T→0, r² sign-blindness documented, ∇F_ord landscape, height-cap (sales→3,
      order→1), weight ordering asserted. `ladder.ts` (diff + exact) + `rungs.ts` (reward composition).
- [x] **M4 — Assignment & score.** commensurability, FixedAssignment, `score.ts` with the
      penalty registry (terms wired, zero-weighted). Gate: golden bar chart scores max;
      scale/shift invariance. **DONE:** 19 tests; golden maxed, 4 invariances exact, perturbations
      lower, penalties sane + weight-on effect, BestAssignment pluggable. Adversarial workflow run.
- [x] **M5 — Gradient wiring.** Collect the 48 leaf grads from the score graph into the
      optimizer-facing ∇S; gradient-goes-downhill test. (Engine already built in M0.) **DONE:**
      6 tests; full-score gradcheck ‖∇_ad−∇_fd‖<1e-5, uphill ascent, translation ⟂ (exact),
      scale residual = surrogate (→0 as T→0), all 48 leaves live, NaN-safe on short segments.
- [x] **M6 — Optimizer.** Adam + evolution/restarts + convergence-on-plateau. Gate:
      multi-seed convergence to bars. **DONE:** `gd.ts` (Adam ascent), `evolve.ts` (population +
      restarts + mutation), `converge.ts` (score-plateau), `session.ts` (orchestrator + T-annealing),
      `scripts/bench.ts`. Bench: **24/24 seeds converge, mean quality 0.999, order sorted 22/24, 0
      pathologies**. 15 optim tests: Adam ascent, plateau-fires-on-valley/not-on-slow-climb, evolution
      reproducibility+elitism, session convergence to all-rungs bars, determinism, reset, annealing.
- [x] **M7 — GUI.** canvas + data panel + score panel + controls + persistence. Gate:
      manual — watch a seed evolve to bars, save, new seed. **DONE:** `ui/{store,canvas,dataPanel,
      scorePanel,controls,app}`, `main.ts`, `index.html` (dark theme), `persistence/store.ts`.
      **Preview-verified:** seed 1 evolved 37%→100% quality (sales all 3 rungs=1, order F_ord=1),
      Save enabled on convergence, Save→Load round-trips, new seed resets, zero console errors.
- [x] **v2 — scoring + optimizer + UI redesign (2026-07-01).** Audit → spec → shipped (see
      Status). Gate: the 6 adversarial acceptance gates in `scripts/accept.ts`
      (`npm run accept`; catalogued in ARCHITECTURE §Verification) + `npm run check`.
- [ ] **M8 — Frame movement.** Optimize the posited frame's origin/direction (the carrier
      dedup is already structural, so scoring stays correct as cells un-merge); revisit
      `frozenDof`/`economy` semantics once frames move.
- [ ] **M9 — BestAssignment (invention mode).** argmax over legal assignments; confirm
      radial/dot encodings emerge for suitable configs.
- [ ] **M10 — Calibration.** Measure the salience resolutions θ per reading class against
      Cleveland–McGill decodability (the gate is the anchor's principled home, CONCEPT §6);
      re-examine `w_ord/w_int/w_ratio`.

## Done this project
- **Carrier toggles (2026-07-02, user-directed): readings on/off dashboard — exploration knob.**
  Turn individual distinct carriers (readings) off to explore what optima emerge without them
  (e.g. no mid points, no rise/run). Deepest layer: `config.carriers.disabled` (canonical ids;
  default empty); `registry.carriers(cfg)` applies the filter AFTER dedup (disabling a merged
  carrier removes its aliases with it; lenient: an alias id toggles the same carrier), with
  `registry.allCarriers(cfg)` as the unfiltered set the UI lists. The census shrinks EVERYWHERE at
  once — both relations' candidate sets, the LSE means' N, the data-ink mean's M, and the panel
  counts (nothing hardcodes 16/12). Guards: an EMPTY candidate set contributes 0 reward (lseMean
  over ∅ = 0, no NaN; gradient stays finite), ink over ∅ = 0, quality KEEPS the #relations
  denominator (honest); in 'fixed' mode a disabled configured fixedCarrier is ignored for that
  carrier. UI: "Readings" strip (`ui/carrierStrip.ts`, collapsible panel above the score panel) —
  one chip per distinct carrier, plain labels, grouped start·mid·end·displacement·angles; toggles
  persist in prefs (`loadDisabledCarriers`, same pattern as maxSteps) and APPLY AT THE NEXT SESSION
  (Reset/new seed) since sessions snapshot cfg at construction; a "pending — applies on Reset" hint
  + chip marks show while pending ≠ live, and the panel/chips read the LIVE objective from the
  SESSION's cfg (`SessionApi.cfg` added; `SessionFactory` now takes the composed cfg). Adversarial
  tests: filtered census math (exact LSE-over-N−1 and ink-over-M reconstruction from the
  breakdown), disabled id appears NOWHERE, all-ratio-off ⇒ sales 0 with finite grads, everything-off
  ⇒ 0/0/0 with zero grads, fixed-mode guard identity, prefs round-trip incl. garbage, live-session-
  untouched + applies-on-reset + reload restore in the app. Verified: typecheck + 262 tests +
  build green; live GUI exercised (toggle 4 readings → Reset → 12-carrier census, 74% quality run,
  reload persistence, zero console errors). REVIEW FIX (same day): a stored/config ALIAS id (e.g.
  `frame.displacement.magnitude`) excluded the carrier from the census (lenient filter) while its
  chip — keyed by canonical id — still rendered "on", and clicking could never clear the alias.
  Added `registry.canonicalDisabledIds(ids, cfg)` (alias→canonical, garbage dropped, deduped);
  app.ts canonicalizes at the prefs/config boundary so the strip and the census can never disagree
  (scoring keeps the lenient filter). +2 adversarial tests (registry coherence identity; app-level
  alias+garbage-in-localStorage → chip off, hint honest, one click clears). Gates re-run: check
  264/264, build, gradcheck, accept --quick --seeds=1,2 (defaults unaffected).
- **UI feedback pass (2026-07-02): sticky selection · gallery · persistent results · persistent
  maxSteps.** User requirements, implemented at the session layer + UI: (1) STICKY SELECTION — the
  main canvas/score panel show one trajectory chosen by STABLE id (never reused across slot
  recycling); default = first trajectory; changes only on a thumbnail click, never on overtake/
  finish/restart. `session.best()` removed from the display path (gallery keeps a subtle ★ best
  marker that may move). (2) GALLERY — the strip renders `session.allTrajectories()`: every
  trajectory ever started, endpoints frozen forever, horizontal scroll on overflow; per-trajectory
  viewports keyed by id; frozen endpoints skip repaint. (3) PERSISTENT RESULTS — nothing clears at
  'done'; only Reset/new-seed clears. (4) PERSISTENT maxSteps — `persistence/prefs.ts`
  (localStorage; precedence stored > config default) survives Reset, new seeds, reloads; input
  allows 10000+. (5) Save persists the SELECTED trajectory via `session.result(id)` (headless
  `result()` still = best). Session API additions: `TrajectoryView.id`, `allTrajectories()`,
  `detail(id)`, `result(id?)`; contract fake (`ui/fixtures.ts`) reworked with ids/endpoints/
  restarts + `forceTotal` for adversarial overtake tests. Adversarial tests: no-auto-switch under
  overtake/finish/restart, gallery monotone growth + bit-frozen endpoints, nothing-clears-at-done,
  localStorage round-trip, Save-saves-selected. Verified: `npm run check` (222 tests) + `npm run
  build` green; live GUI exercised (run to done with restarts, selection pinned, reload persistence).
- **M0 (2026-07-01):** Project scaffolding (Vite/TS/Vitest/ESLint), `package.json` with the six
  workflows, strict `tsconfig` (`noUncheckedIndexedAccess`), full 33-file module tree (autograd
  built, rest stubbed), `config.ts` single-source-of-tunables, and `core/rng.ts` (mulberry32).
  Autograd engine (`engine.ts` primitives + iterative `backward`, `ops.ts` reductions,
  `gradcheck.ts`) fully gradchecked. Files: `src/core/autograd/*`, `src/core/rng.ts`, `src/config.ts`.

## Key decisions log
- Stack: TypeScript + Canvas, no backend. Gradients via a small reverse-mode **autograd engine**
  (elegant, and keeps the scoring function freely editable — autodiff differentiates whatever
  score we write, so no gradient is hand-maintained); finite differences retained only as a
  gradient-check test. See `ARCHITECTURE.md`.
- Penalty terms ship wired-but-zero-weighted, never stubbed (Principle I).
- Convergence detected on **score plateau**, not parameter fixity (optimum is a valley).
- **Added `core/rng.ts` (mulberry32)** as a foundational shared PRNG — data/figure/mutation/restarts/
  gradcheck all draw from it, so every result is reproducible from a seed. (Not in the original
  module map; a warranted deepening per Principle I, flagged by the optimizer-design pass.)
- **Finding (M0):** detaching the mean in variance/covariance/r² does **not** corrupt the gradient —
  the through-μ term vanishes because Σ(xᵢ−μ)=0 (μ is the stationary point of the squared-deviation
  sum). We still build reductions from a live `Value` mean for robustness/clarity, but it is not a
  correctness requirement (refines the math-core design note). Verified by a passing gradcheck.
- **Adversarial review (post-M4, 5 skeptics + verify):** found 4 real defects in the score core, all
  fixed at the deepest layer before M6 (they would have silently killed the optimizer):
  1. **Zero-length segment → NaN reward + NaN on ALL 48 grads** (magnitude=0 → fRatio log(0)=−∞ → var NaN,
     poisoning the shared tape). Fix: `config.eps.length` floor; magnitude = √(dx²+dy²+ε) on both paths.
  2. **circularVar < 0 at common orientation** (ε inside √ pushed R>1 → negative frozenDof penalty). Fix:
     normalize by √(n²+ε) so R≤1 exactly; value ∈[0,1], =0 at common orientation. (ops + statsN.)
  3. **atan2-at-origin NaN grads** (0/0 in backward) — bit frozenDof's tilt path when enabled. Fix:
     r²=0 ⇒ 0 gradient in `atan2` backward (engine, numerical guard).
  The scale-nonorthogonality "finding" was correctly REFUTED (expected surrogate behavior, handled in M5).
  Regression tests in `degeneracy.test.ts` (7). Lesson: the log-repulsion holds for length>0 but NOT at
  exactly 0 — the ε-floor makes the invariant true AT zero, localizing degeneracy instead of poisoning all 48.
- **Major improvement (M6): spread-normalized + annealed ordinal surrogate.** The original `fOrd` used
  ABSOLUTE margins (cᵢ−cⱼ)/T. Bench exposed the consequence: the order carrier (x-positions ~[0,100]) at
  T=0.1 saturated every sigmoid (arg ~ hundreds) → dead ordinal gradient → x never sorted (order F_ord
  stuck ~0.72). Fix (deepest layer): (1) normalize the margin by spread(c)=√(Var(c)+ε), making the
  surrogate SCALE-INVARIANT (like exact Kendall — order is scale-free) and T dimensionless; (2) ANNEAL T
  from `anneal.tStart`(3.0) → `T`(0.1) via exp decay (tau=250) in the session — hot T early gives a global
  sorting force on far-apart inversions, cooling sharpens to exact order. Result: order sorts to 1.000 on
  22/24 seeds (was ~0.72), mean quality 0.999. BONUS: normalization also eliminated the M5 scale-orthogonality
  residual (grad·scale now ~1e-13). Ordinal `fOrd` differentiable tests now use small T (sharp) for the
  saturated-limit assertions; exact Kendall unchanged.
- **Finding (M5, superseded by the M6 normalization above):** the surrogate's scale-nonorthogonality came
  from absolute margins; spread-normalization removed it. Translation was always exactly invariant.
- **Finding (M3):** the ordinal surrogate's gradient magnitude depends on each pair's MARGIN
  |cᵢ−cⱼ|/T, not on how wrong it is (sigmoid' is symmetric). It is strong only NEAR the decision
  boundary and saturates to ~0 for large margins either way — so F_ord "vetoes inversions but does
  not pull" once confidently ordered. This is precisely why global ordering needs evolution/restarts
  (M6) while GD polishes the ratio/interval structure. (Refines the design's "∇F_ord≈0 in-order" note.)
- **Baked-in v1 decisions** (from the approved plan): posited frame FIXED (∥ page) in v1;
  FixedAssignment sales→length (#9, no frame), order→x-position (#1); weights w_ord=1<w_int=2<w_ratio=4;
  one differentiable code path (plain-number path only for display; sole value-fork is exact F_ord).
- **Scoring v2 (2026-07-01, audit-driven; supersedes the linear comprehensive sum):** within-relation
  LSE smooth-max (more-matches as a strict-monotone bonus, never a linear trade); salience gate as
  the reader model; chance-corrected direction-symmetric rungs (τ_sym; signed-safe base·coh ratio
  with the v2.1 per-entry v-implied sign normalization); data-ink penalty ON over the deduped
  carrier set; structural carrier dedup (16 distinct under v1 geometry); cyclic demoted to
  ordinal-only. Legibility enters ONLY through the salience gate and the surrogate's spread floor —
  the fidelities themselves stay scale-invariant. Optimizer: champion adoption replaced by
  independent played-out trajectories (frozen endpoints; best endpoint wins).

## Open questions
- **Circular rung forms.** Branch-free circular statistics (circular correlation/variance) so
  bearings can soundly carry interval/ratio again; until then interval/ratio-from-bearings is OFF
  and even ordinal-from-bearings keeps the branch-cut limitation (registered by the v2 redesign).
- **Calibration (M10).** Measure salience θ per reading class (Cleveland–McGill); the
  `w_int` (r²) vs `w_ratio` (exp-of-variance) unit mismatch also remains.
- **Frame movement (M8).** Optimize the posited frame's origin/direction; the dedup layer is
  ready, but converge/economy semantics with moving frames are not designed yet.
- BestAssignment cost when argmax runs every step — may need caching (revisit at M9).
- LSE β (10) and data-ink weight (0.25) are chosen, not derived — sensitivity unexplored.

## Next action
**Working state:** v2 shipped end-to-end — scoring v2.1, optimizer v2 (played-out trajectories),
UI v2 (trajectory strip, fixed viewport). See Status (top) for verified numbers. Workflows:
`npm run check` (typecheck+lint+tests) · `npm run accept` (the 6 adversarial gates; add
`-- --sessions` for gate 5) · `npm run gradcheck` · `npm run bench` · `npm run dev` (GUI at :5173).

Open menu (user's call which):
- **Circular rung forms** — restore interval/ratio-from-bearings soundly; removes the registered
  cyclic limitation and re-opens dial/radial encodings to the sales relation.
- **M8 frame movement** — optimize the posited frame; the structural dedup already supports it.
- **M10 calibration** — measure salience θ per reading class (the Cleveland–McGill anchor's
  principled home, CONCEPT §6).
- **Performance** — the full-matrix objective remains ~10× heavier than fixed mode; reuse
  extractions / cache graph structure / cut the 66-pair fOrd loops if the GUI or bench needs it.
  Gate: bench wall-time ↓ with `npm run check` + `npm run accept` still green.

Fixed-mode note: `config.scoring = 'fixed'` restores the single-carrier bar-chart model
(sales→length, order→x-position), scored on the SAME v2 ladder — kept as a swappable option.
