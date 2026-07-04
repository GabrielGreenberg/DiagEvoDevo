# ARCHITECTURE.md — The Build

Realizes `CONCEPT.md`. Read that first. Principle I (depth over patches) governs every
decision here: the module boundaries mirror the *conceptual* seams, so that editing the
math means editing one small pure module, never hunting through glue.

---

## Tech stack (and why)

- **TypeScript, single-page app, no backend.** The whole problem is 48 numbers; it runs
  live in the browser at 60fps with room to spare. A server would add a websocket-streaming
  convenience layer that buys nothing and violates Principle I. Runs in the desktop app via
  a local dev server.
- **Vite** for dev/build. **Canvas 2D** for rendering (the figure is line segments; SVG
  also acceptable, canvas preferred for cheap per-frame redraw).
- **No heavyweight ML framework.** Gradients come from the score itself (below). We are not
  training a network.
- **Vitest** for the test workflows.
- State is plain modules + a tiny store; no framework required. If a UI framework is later
  justified, introduce it at the architecture level, not as a wrapper.

### Gradient strategy (decided)
Gradients come from a small in-house **reverse-mode automatic differentiation** engine
(`core/autograd`, micrograd-style: scalar `Value` nodes carrying local derivatives with a
`backward()` tape; a 12-vector is a `Value[]`). The figure's 48 parameters are the leaf
nodes; the score is built entirely from differentiable primitives (`+ − × ÷`, `log`, `exp`,
`sqrt`, `atan2`, `sigmoid`, and the derived `variance`, `correlation`, circular-mean ops);
one `backward()` fills ∇S exactly.

This is the elegant solution *and* the one that keeps the scoring function freely editable —
which is what "manipulate the math" actually means here. Autodiff differentiates **whatever
score you write**, so changing a fidelity formula, adding a rung, or adding a penalty needs
**no gradient maintenance**: you never hand-derive or re-verify a derivative. The theory can
evolve without touching gradient code. (Hand-written analytic gradients are rejected for
exactly this reason — they would have to be re-derived and re-checked on every change to the
math.)

Detail: prefer `logLength = ½·log(dx² + dy²)` over `log(sqrt(...))` so the gradient tape
stays clean and the zero-length cusp — already repelled by the `log` — never enters as a
`sqrt'` singularity.

Finite differences are **retained only as a test**: the gradient-check workflow verifies the
autograd primitives and the full-score gradient (`‖∇_autograd − ∇_finite‖ < ε`). That is how
we trust the engine, not how we compute gradients.

---

## Module map

Boundaries follow the conceptual seams in `CONCEPT.md`. Every module is pure where it can
be; all tunables live in `config`.

```
src/
  config.ts                  All weights, temperatures, seeds, hyperparameters. Single source.
  core/
    autograd/
      engine.ts              Reverse-mode AD: Value node, ops, backward(). 48 leaves → exact ∇S.
      ops.ts                 variance, correlation, circularMean, sigmoid, logLength — differentiable.
      gradcheck.ts           Finite-difference check of every primitive + full score (test util).
    scale.ts                 ScaleType {ordinal,interval,ratio,cyclic}; the v2.2 reads-down order
                             (the full chain ordinal ≤ interval ≤ ratio ≤ cyclic — circular edges
                             restored; sound circular rung forms live in fidelity/, routed by
                             unit class); commensurability(dataType, stamp) legality check.
    data.ts                  DataSet = labels A..L (ordinal) + values ℝ⁺ (ratio).
                             seedToDataSet(seed): deterministic positive values.
    figure.ts                Figure = Float64Array(48) (12 segments × [sx,sy,ex,ey]).
                             seedToFigure(seed); accessors for start/end/midpoint/displacement.
    frame.ts                 Page (direction, no origin) and PositedFrame (origin+direction).
                             A frame's parameters may themselves be fixed or optimized later.
    measurements/
      types.ts               Measurement = { id, label (plain English), anchor, part, reading,
                                             stamp: ScaleType, unitClass: 'length'|'angle',
                                             extract / extractValue → 12-vector }.
      registry.ts            Builds the 2×4×4 stock; marks the 6 undefined; exposes the 26 live.
                             v2: carriers(cfg) — the STRUCTURAL dedup into distinct carriers;
                             every score, LSE mean, penalty, and count runs over this set,
                             never the raw census. carrierFor(id) resolves aliases too.
      readings.ts            proj∥, proj⊥, magnitude, angle as pure vector ops.
      paths.ts               v2.2 strong coincidence: each length-class reading's MEASUREMENT
                             PATH (the page segment its reading procedure traces — plumb,
                             radial ruler, ink, dogleg leg), derived structurally from
                             (anchor, part, reading) against cfg.frame/cfg.page; the smooth
                             orientation-symmetric overlap kernel + ink gate. Value + exact
                             twins; shared subexpressions cached per eval.
    fidelity/
      ladder.ts              τ_sym (fOrd + smooth fold), fInt = r², signed-safe fRatio (base·coh),
                             plus lseMean/smoothAbs helpers (composed from gradchecked primitives):
                             (c, v) → [0,1]. Exact + differentiable forms.
      rungs.ts               Registered rungs with weights; height-cap by data ScaleType; threads
                             the carrier's unit class to the unit-bearing knobs (legibility spread
                             floor, salience θ).
    assignment.ts            Assignment policy interface; FixedAssignment; BestAssignment(argmax).
    penalties/
      registry.ts            Registered penalty terms, configurable weights; defines PenaltyContext
                             incl. the scored cells (CellQ) score.ts passes down.
      spuriousness.ts        DATA-INK term (v2 semantics), ON by default (0.25):
                             mean_m s_m·(1 − smoothmax_R q_m). Consumes the cells scored by
                             score.ts — never re-extracts or re-scores.
      frozenDof.ts           Var(baseline) + circularVar(tilt) (weight 0, fully wired).
      economy.ts             Frame/measurement count (weight 0, fully wired).
    score.ts                 v2: q_m(R) = salience·(rung reward)/maxRung per distinct carrier;
                             relation(R) = LSE_m(q); S = Σ_R relation(R) − Σ penalties.
                             Returns {total, Breakdown v2} (interfaces below).
    gradient.ts              Runs the score forward on Value-leaves, calls backward(), collects
                             the 48 leaf grads into ∇S for the optimizer. (Engine: core/autograd.)
  optim/
    gd.ts                    Adam / plain GD stepper over the 48-vector.
    evolve.ts                v2 outer layer: the trajectory pool — fresh-random and
                             mutate-best-endpoint replacements for frozen slots
                             (evolve.mutateFraction). No adoption, no mid-run culling.
    session.ts               Orchestrator v2 (multi-start): populationSize INDEPENDENT
                             trajectories, each with its own Adam state, anneal clock, and plateau
                             detector; a plateaued (or per-trajectory-capped) trajectory FREEZES
                             as an endpoint and its slot restarts until maxRestarts is exhausted;
                             result = best endpoint by exact score. Exposes every trajectory
                             (figure, score, live/frozen) for the UI strip.
    converge.ts              Plateau detection on SCORE (not params — optimum is a valley).
  persistence/
    store.ts                 Save/load a Result {figureSeed, dataSeed, figure, data, score,
                             config-snapshot} to disk/JSON. Results are reproducible from seeds.
  ui/
    canvas.ts                Renders the evolving figure (12 segments) in a FIXED viewport
                             (page box + margin, no per-frame refit — the frame never appears
                             to move). Draws the posited frame.
    dataPanel.ts             Renders the dataset clearly: labels A..L + values, as a reference
                             view. This is the target, shown beside the figure.
    scorePanel.ts            v2: plain-English labels; per-carrier rows with per-rung mini-bars
                             (τ signed ↑/↓, r², ratio) + salience chip; distinct-carrier counts;
                             data-ink penalty row; honest headline (quality ≈ 0 for random
                             figures); byCap live.
    controls.ts              New Figure Seed · New Data Seed · Run/Pause · Step · Reset ·
                             Save · Load. Seeds shown and editable.
    app.ts                   Wires the loop to requestAnimationFrame and the store; the
                             trajectory strip (a thumbnail per played-out trajectory; the main
                             canvas follows the best).
  main.ts
scripts/
  accept.ts                  The scoring-v2 adversarial acceptance gates (npm run accept).
  bench.ts                   Headless convergence/speed report over a batch of seeds.
```

### Score interfaces (v2)

- `carriers(cfg): Carrier[]` — the deduped distinct-carrier set for the configured geometry.
  `Carrier = { id (canonical, max-stamp member), label, stamp (max over members), unitClass,
  aliases[] (merged-away cell ids), measurement }`. The dedup rules are **structural**
  (displacement magnitude is anchor/direction-free; displacement readings merge iff directions
  parallel with the same sense; point projections merge iff frame ∥ page at the page origin), so
  they remain correct when frames move (M8+). 16 distinct under the v1 geometry.
- `Breakdown` (v2): `{ total, reward, penalty, maxReward = #relations, quality = reward/#relations,
  relations: RelationBreakdown[], penalties: PenaltyTermExact[], distinctCarriers, censusSize }`.
  `RelationBreakdown = { key, dataType, aggregated (the LSE ∈ [0,1]), normalized, reward,
  maxReward, carriers: CarrierScore[] (sorted by q, best first) }`.
  `CarrierScore = { id, label, stamp, aliases, salience, q, reward, signedTau (= 2·F_ord − 1,
  the ↑/↓ direction display), rungs: {name, f}[] }`. v1 names (`measurements`, `normalized`)
  are kept as deprecated aliases for consumers.
- `PenaltyContext.cells / .cellsExact` (`CellQValue` / `CellQExact`): each carrier's salience and
  per-relation q, computed ONCE in `score.ts` and passed down — a penalty term must see exactly
  the cells the reward saw and never recompute them.
- Session (v2 multi-start API): the session exposes its trajectory list for the strip and
  `result()` returns the best endpoint (`convergedByCap` distinguishes plateau from step-cap).

### Modularity contract (Principle I in practice)
- A new **measurement** = one entry in `readings.ts` + registry; nothing else changes.
- A new **rung** or a changed fidelity formula = one function in `fidelity/`, written against
  the autograd `Value` type; the ladder, score, and gradient pick it up unchanged — its exact
  gradient follows automatically, with no gradient code to edit.
- A new **penalty** = one file in `penalties/` + registry entry; `score.ts` already sums
  the registry. It ships **wired but zero-weighted**, never commented out or stubbed.
  (Data-ink is the one term whose default weight is nonzero — a v2 design decision, not an
  exception to the wiring rule.)
- No tunable constant appears outside `config.ts`.
- `fidelity/`, `penalties/`, and `score.ts` are written against the autograd `Value` type, so
  differentiation flows end-to-end from the 48 leaves. A plain-number path exists only for
  displaying exact metrics; the optimized path is always the differentiable one.

---

## GUI specification

A single screen, two panes plus the trajectory strip (UI v2):

- **Figure pane (left):** the twelve line segments on a canvas, redrawn each frame as they
  evolve, in a **fixed viewport** (the page box plus a margin — never refit per frame, so
  the frame never appears to move). Show the posited baseline/frame. Convergence visibly
  settles.
- **Data pane (right):** a clear, static representation of the *dataset* being targeted —
  labels **A, B, C, … L** along the ordinal axis, their ratio (dollar) values shown as a
  reference. This is the ground truth the figure is trying to become; keep it legible and
  separate from the evolving figure.
- **Score readout (v2):** honest headline (`quality = reward/#relations`, ≈ 0 for random
  figures — the chance floors are removed at the source, not massaged in display); the
  data-ink penalty row; per-relation blocks over the **distinct** carriers (counts shown)
  with **plain-English labels** (`start x`, `run`, `length`, `fr·mid dist`, … — no ∥/⊥/disp
  glyphs), per-rung mini-bars (τ signed with ↑/↓, r², ratio) and a salience chip per carrier
  row; `byCap` shown live.
- **Trajectory strip:** one thumbnail per trajectory so the user watches each one play out;
  frozen endpoints stay visible; the main canvas follows the best.

**Controls & flow:**
- **New Figure Seed** → fresh random 48-vector; **New Data Seed** → fresh dataset. The two
  seeds are independent and both displayed/editable.
- **Run / Pause / Step / Reset.** Run animates the hybrid optimizer live.
- On **convergence** (score plateau), the run auto-settles and enables **Save**.
- **Save** stores the Result (reproducible from its seeds + config snapshot); **Load**
  restores one. Then the user starts a new seed and repeats.

---

## Verification (adversarial invariant catalogue)

A feature is done when tests that *try to break* these pass. Run via the test workflow;
never verify by eyeballing. Add to this list as the system grows.

**Fidelity ladder (v2 — chance-corrected, direction-symmetric)**
- `F_ratio(±k·v, v) = 1` for all `k>0` (mirrored/all-negative encodings are legible);
  `F_ratio(v², v) < 1`; mixed-sign carriers ⇒ `F_ratio ≈ 0`; constant/degenerate carriers
  earn NO free reward; `F_ratio ≤ 1` adversarially (random signed vectors); proportionality
  is a stationary point of coh (the optimizer must not warp golden bars).
- `F_int(a·v + b, v) = 1` for all `a≠0, b`; `F_int(v², v) < 1`.
- `τ_sym(monotone↑(v), v) = 1 = τ_sym(monotone↓(v), v)`; `τ_sym ≈ 0` on random and constant
  carriers (no 0.5 chance floor); invariant under monotone transforms of `c` above the
  legibility floor; the surrogate reads sub-legible order as ties (τ_sym → 0) and its
  gradient stays bounded on near-constant carriers (no 1/spread explosion); corrective
  gradients fix inversions and fold mostly-descending carriers toward full reversal.
- **Nesting (symmetric sense):** `c = ±k·v ⇒ F_ratio=1 ⇒ F_int=1 ⇒ τ_sym=1` (never violated).
- Differentiable `F_ord` surrogate → exact `F_ord` as `T → 0` (above the floor).
- **Salience:** `s = Var/(Var+θ²)` gates every cell; a sub-threshold perfect carrier earns ≈ 0.
- **Circular rungs (v2.2, angle carriers — `fidelity/ladder.test.ts`):** `fIntCirc` is
  wrap-invariant (adding 2π to any subset of bearings changes nothing; a 4-rad dial wraps and
  R² stays ≈ 0.95 where linear r² collapses to 0.05), rotation-invariant (θ → θ+φ exact),
  direction-symmetric (mirrored bearings identical), ∈ [0,1] on adversarial draws, degenerate/
  rank-1 bearings → 0 smoothly with finite gradients, chance floor ≈ 2/(n−1); the unit-class
  routing is load-bearing (INT_RUNG picks the circular form iff `unitClass = 'angle'`, both paths).
  BOTH paths share the ε-guard: exactly-antipodal bearings (θ ∈ {0, π} — mixed-direction
  horizontal segments; the Mardia det is float-cancellation noise there) score ~0 on the EXACT
  twin too (pre-fix it returned 1.476 > 1 through scoreExact; 24-pattern regression pins ≤ 1e-6).
- **Dial fixtures & ANTI-CLIFF (`core/dial.test.ts`):** a perfect dial earns the full sales
  ladder through its tilt carrier; a mirrored dial scores identically; rotating the dial keeps
  `fIntCirc` bit-stable while ratio honestly degrades (a gauge's zero matters). One needle
  crossing ±π moves the cell by ≤ the DERIVED bound `w_ratio·(2/12)/cohCeil + w_ord·(2·11)/66`
  (measured Δcell 1.000 of max 7.5; whole-figure Δtotal 0.073 — v1's cliff was Δ4.72 from
  0.002 rad); the value spiral's whispered angles stay salience-gated; random bearings sit at
  the fIntCirc chance floor; the origin dial EARNS the sales angle-pair coincidence (σ_eqAngle
  routing); full-score gradcheck passes with angle cells live in sales.

**Scale / commensurability**
- `commensurability(dataType, stamp)` accepts iff `dataType ≤ stamp`; rejects month→interval-only
  reads and any cross-type comparison.
- v2.2 reads-down: the full chain `ordinal ≤ interval ≤ ratio ≤ cyclic` (circular edges
  restored — dials/gauges are legitimate; angle carriers score interval via the wrap- and
  rotation-invariant Mardia circular–linear R² `fIntCirc`, ratio via the wrap-continuous
  `fRatio` unchanged; the ±π wrap moves a cell by a bounded ≈ one-item coherence share,
  measured in `core/dial.test.ts`, vs v1's 5.56 → 0.84 relation cliff). No reading is
  structurally blocked from any relation; exclusions only via the Readings toggles.
- Every scored comparison is between two length-12 vectors of compatible type (a
  cross-reading vector cannot be constructed through the public API).

**Measurements & carriers**
- Exactly 26 live of 32; the 6 undefined are precisely `page × {start,end,midpoint} ×
  {magnitude,angle}`.
- `length` identical under both anchors; run/rise/tilt identical iff frame ∥ page.
- Raw scale census is 15 ratio / 6 interval / 5 cyclic.
- **Dedup:** under the v1 geometry `carriers(cfg)` has exactly 16 distinct carriers
  (12 ratio / 4 cyclic; v2.2: sales → 16 AND order → 16); merged carriers keep the max stamp and
  list their aliases; the rules are structural (moving/rotating the frame un-merges the
  right classes); `carrierFor` resolves aliases.

**Score & gradient**
- Score invariant to global scale `k` and horizontal translation (numerically, to `ε`).
- **Golden bar chart (v2 sense):** a hand-built label-ordered bar chart beats the audit's
  winning degenerates and random figures (gate 1 below); perturbations along invariant
  directions leave the score unchanged.
- Fixed-mode data-ink runs over the FULL carrier set: fixed-mode pick-up-sticks with
  identical assigned carriers pays strictly more ink and a lower total.
- **Autograd trusted via finite differences:** for each primitive op and for the full score,
  `‖∇_autograd − ∇_finite‖ < ε` on random inputs (incl. the LSE and smooth-abs compositions).
  This is the only role finite differences play.
- Autograd gradient points downhill: a small step along `−∇S` decreases `S` for random figures
  away from optima.

**Coincidence bonus (v2.2) & aggregation switch**
- `eq(c, c) = 1` exactly; `eq(2·c, c) ≈ 0` at page scale (proportionality alone earns nothing) with
  a strictly monotone convergence gradient as scales converge (`k → 1`) and as an offset zero
  grounds (`baseline b → 0` on golden bars ⇒ eq(rise, end-y) → 1).
- Golden bars earn the bonus through the NAMED `end-y ≡ rise ≡ length` triple (and the
  `start-x ≡ end-x ≡ mid-x` verticality cluster for order); random figures earn ≈ 0.
- The pair gate inherits the cells: equal-but-MEANINGLESS carriers ⇒ ≈ 0 (q inside the gate);
  equal-but-CONSTANT carriers ⇒ 0 (salience inside q); a proportional-but-different-scale carrier
  (mid-y at k/2) never pairs even at q ≈ 1. Merged (definitionally equal) readings cannot pair —
  the dedup made them one carrier; only achieved identity counts.
- σ_eq is routed per unit class: angle pairs score in radians (σ_eqAngle), length pairs in page
  units (σ_eqLen); changing σ_eqAngle never moves a length-only relation (bit-identical).
- `weight = 0` removes the term BIT-EXACTLY from both paths and the tape (total root stays
  `sub(reward, penalty)`; strictly fewer nodes; exact path reports the disabled shape).
- Value ≈ exact at small `T` including the bonus; the full-score gradcheck passes with the bonus
  ACTIVE (jittered golden, eq ≈ 1 region) and under `matchBonus = false`.
- `matchBonus = false` (best-carrier-only softmax mean): one perfect salient carrier ⇒ relation
  ≈ 1; a second perfect carrier adds < 0.01; the mediocre-dilution non-monotonicity is documented
  and pinned. The LSE monotonicity invariants above apply to `matchBonus = true` (the default,
  which the acceptance gates run at).
- The bonus WEIGHT is a basin-selection dial (2026-07-02 verification finding): the weak
  same-magnitude eq cannot distinguish axis-collapse from arranged commuting readings, so too
  high a weight stabilizes collapse traps at FULL session depth — dot plots (segments shrunk to
  points make start≡mid≡end coincide in both axes) and mid-anchored bars (a lone mid-y ≡ length
  pair under the best-pair-dominant LSE). At the default (0.2) all six full-depth acceptance
  seeds end legible; 0.3 re-opens the traps (seeds 1, 5) IN WEAK MODE. Statically golden bars
  outrank both traps at every weight in [0, 0.3] — the hazard is dynamical only. The strong
  same-ink-path mode (below) closes the collapse loophole at the formula layer.

**Strong coincidence (same-ink-path, `bonuses.coincidence.mode`, 2026-07-03)**
- Measurement paths match the design table under the v1 geometry EXACTLY (pinned endpoints):
  point x = ruler from the perp axis at the point's height; point y = plumb from the frame
  axis; fr·dist = radial ruler from O; length = the segment's own ink; run/rise = the dogleg
  legs with the corner at `(end_x, start_y)` (parallel leg walked first — the convention).
  Angle readings and origin-free page point projections return null (no linear ink-path) and
  their pairs keep the WEAK formula bit-exactly, in strong mode.
- Overlap kernel: identical paths ⇒ ov ≈ 1 (ε-rounding ≤ 1e-6); orientation symmetry is
  BIT-exact (either path traced backwards); monotone decay at σ_path scale; smooth in all 8
  endpoint coordinates (gradcheck).
- Ink gate: exactly-collapsed segments ⇒ g = 0 EXACTLY (the dot-plot trap earns 0 strong
  overlap on every path pair); near-collapse pays proportionally (3-unit whiskers keep < 1/3
  of their weak coincidence).
- The promised consequences hold and are pinned (`core/strongCoincidence.test.ts`): grounded
  golden's end-y ≡ rise ≡ length triple has overlap = mean ink gate (ov_i = 1); FLOATING bars
  kill (end-y, length) < 1e-12 while (rise, length) survives bit-for-bit (a vertical segment's
  rise leg IS its ink); the mid-anchor trap's lone (mid-y, length) pair is path-killed
  (ink 0.09); spoke plots earn (fr·end dist, length) legitimately; verticality's
  start-x ≡ end-x rulers at different heights earn ~0 while the axis identity
  start-x ≡ fr·start-dist carries golden's order coincidence.
- Trap regression (executed, `scratch/verify_strong_trap_regression.out.txt`): at the weight
  that trapped weak mode (0.3), the traps' weak bonuses ≈ golden's (dot 0.201 / mid-anchor
  0.201 vs golden 0.226); under strong the traps collapse (dot 0.0008, mid-anchor 0.031 —
  the residue is the LEGITIMATE rise ≡ length) while golden keeps 0.088 and outranks both.
- Loophole hunt (executed, `scratch/verify_strong_loopholes.out.txt`): figures that farm
  REAL strong overlap (y-axis pileup, single origin ray) buy their eq = 1 / ink ≈ 1 pairs by
  surrendering the order relation entirely — reward 0.80–0.92 vs golden 1.49 buries them at
  any weight in [0, 0.3]; strong pairs are parasitic on already-earned q, so no degenerate
  out-scores golden (ranking probe: both gate datasets, all degenerates + traps, 50 randoms).
- Mode 'weak' builds a BIT-IDENTICAL tape to pre-strong HEAD (byte-identical exact totals,
  Value totals, and full 48-leaf gradient digests on 5 figures at weight 0.2 AND 0; twin
  fingerprint run in a HEAD worktree); weight 0 in strong mode = weight 0 in weak mode (same
  node count, root stays `sub`). Strong tape ≤ 2.2× weak nodes (overlaps cached per unordered
  pair across relations, like eq).
- Value ≈ exact lockstep and the full-score gradcheck hold with strong mode ACTIVE (jittered
  golden AND jittered floating baseline — ov/gate kernels mid-slope); the grounding pull
  ∂total/∂start_y is strictly stronger under strong than weak on floating baselines.
- UI (reinforcement mini-panel): the coincidence pref is a 3-state selector off/weak/strong
  (exclusive chips, pending/live semantics as the carrier strip); legacy boolean prefs migrate
  'true' → 'weak', 'false' → 'off', garbage → config default; the score panel's bonus row
  names the mode it was scored under and path-bearing pairs display their ink factor.
- PROMOTED to the config default (2026-07-03): the acceptance certificate of record now refers
  to **strong/0.2** — full `npm run accept` under the strong default: 49/49 checks, division of
  labor 6/6, LEGIBLE 6/6, full-depth quality 0.799–0.807 (~20 min/seed at the ~2× strong tape).
  The weak v2.2 numbers stay pinned in tests under an explicit `mode: 'weak'` override (the
  bit-exactness invariant is unchanged; only the plumbing names the mode), and weak remains
  selectable via the UI selector or config.

**Optimizer (v2 — played-out trajectories)**
- Every trajectory is independent: its own Adam state, anneal clock, plateau detector; no
  mid-run adoption or culling; a plateaued/capped trajectory freezes as an endpoint and its
  slot restarts (alternating fresh-random / mutation-of-best-endpoint) until maxRestarts.
- Session result = best endpoint by exact score; convergence detector fires on score plateau
  even while parameters drift along the invariant valley; `byCap` distinguishes step-cap
  endings from genuine plateaus.

**Penalties**
- Data-ink (on by default): ≈ 0 for golden bars (salient carriers carry relations), high for
  salient random figures; every term ≥ 0 (mean-form smoothmax ≤ max ≤ 1).
- Zero-weighted terms (`frozenDof`, `economy`) still compute sane values on hand-built inputs
  so enabling a weight has the intended effect with no code change.

### Scoring-v2 acceptance gates (adversarial; `scripts/accept.ts`, workflow `npm run accept`)

1. **Fixture ranking:** label-ordered golden bars BEAT value-sorted bars, nested-ray,
   value-spiral, collinear-pileup, and random figures — the audit's winning degenerates,
   kept forever as regression fixtures.
2. **Monotonicity:** adding a matching carrier never lowers a relation score; one
   perfect+salient carrier beats many mediocre ones.
3. **Salience:** a sub-threshold (sub-pixel) perfect carrier earns ≈ 0; growing its spread
   recovers it monotonically.
4. **Signed ratio:** mirrored bars score full ratio; mixed-sign carriers don't; no NaN
   anywhere (degeneracy suite preserved).
5. **Sessions on seeds 1..6:** some salient carrier reaches τ_sym ≥ 0.9 for order AND some
   salient carrier reaches ratio ≥ 0.9 for sales (division of labor), and segment dumps look
   legible. (Runs the real optimizer; `npm run accept -- --sessions`.)
6. **`npm run check` fully green; gradcheck passes** (LSE & smooth-abs built from existing
   gradchecked primitives).

---

## Workflows (Principle II)

Define these as scripts/tasks so neither building nor verifying costs context:

- `dev` — run the app live.
- `test` — full adversarial suite (Vitest).
- `test:watch` — during construction.
- `check` — typecheck + lint + test, the pre-"done" gate.
- `bench` — steps/second and convergence-rate report from a batch of seeds (headless).
- `gradcheck` — autograd-vs-finite-difference report over the primitives and the full score;
  verifies the AD engine.
- `accept` — the scoring-v2 adversarial acceptance gates (§Verification above); gates 1–4
  always hard-fail, gate 5 (sessions) runs with `-- --sessions`.

Prefer invoking these over re-deriving. If a construction step repeats, make it a workflow
before doing it twice.
