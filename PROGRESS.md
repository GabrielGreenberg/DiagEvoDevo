# PROGRESS.md — Living State

Single source of truth for *where we are*. Read this first every session; append to it in
the same session that work happens. Never reconstruct state that belongs here.

---

## Status: M4 + M5 COMPLETE (score core + gradient wiring; adversarial review of score core run). M6 in progress.

_Run scope (user-chosen 2026-07-01): build through **M7** (v1), full autonomy. Stop before M8–M10._

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
- [ ] **M6 — Optimizer.** Adam + evolution/restarts + convergence-on-plateau. Gate:
      multi-seed convergence to bars.
- [ ] **M7 — GUI.** canvas + data panel + score panel + controls + persistence. Gate:
      manual — watch a seed evolve to bars, save, new seed.
- [ ] **M8 — First penalty on.** Enable `frozenDof`; confirm it installs shared baseline.
- [ ] **M9 — BestAssignment (invention mode).** argmax over legal assignments; confirm
      radial/dot encodings emerge for suitable configs.
- [ ] **M10 — Weight calibration.** Anchor `w_ord/w_int/w_ratio` to Cleveland–McGill.

## Done this project
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
- **Finding (M5):** the EXACT reward is scale-k invariant, but the differentiable ordinal SURROGATE is
  not (it depends on margins |cᵢ−cⱼ|/T, which scaling inflates). Translation is exactly invariant (it
  preserves differences); scaling is only approximately so, with the residual shrinking as T→0. So the
  only overall-scale signal in the gradient is the surrogate's mild pull to grow margins — the figure can
  drift in scale along the valley floor while the SCORE plateaus. This is exactly why M6 detects a score
  plateau, not parameter fixity. (Confirms the valley/plateau design.)
- **Finding (M3):** the ordinal surrogate's gradient magnitude depends on each pair's MARGIN
  |cᵢ−cⱼ|/T, not on how wrong it is (sigmoid' is symmetric). It is strong only NEAR the decision
  boundary and saturates to ~0 for large margins either way — so F_ord "vetoes inversions but does
  not pull" once confidently ordered. This is precisely why global ordering needs evolution/restarts
  (M6) while GD polishes the ratio/interval structure. (Refines the design's "∇F_ord≈0 in-order" note.)
- **Baked-in v1 decisions** (from the approved plan): posited frame FIXED (∥ page) in v1;
  FixedAssignment sales→length (#9, no frame), order→x-position (#1); weights w_ord=1<w_int=2<w_ratio=4;
  one differentiable code path (plain-number path only for display; sole value-fork is exact F_ord).

## Open questions
- Weight calibration units (`F_int` r² vs `F_ratio` exp-of-variance) — deferred to M10.
- Whether the posited frame's own origin/direction should be optimized or fixed in v1.
  Lean: fixed in M4–M7, optimizable later.
- BestAssignment cost when argmax runs every step — may need caching (revisit at M9).

## Next action
M6 — Optimizer. `optim/gd.ts` (Adam ASCENT — score is a reward; sign convention lives here once),
`optim/evolve.ts` (population of seeded random restarts + gaussian mutation; pluggable assignment
search, identity under Fixed), `optim/converge.ts` (score-plateau: converged ⇔ step≥minSteps ∧ window
full ∧ max−min≤plateauEps), `optim/session.ts` (orchestrator seed→init→step→converge→result),
`scripts/bench.ts`. Gate: ≥N seeds converge to TRUE 3-rung bars (not truncated/log pathology); detector
fires on a hand-built valley trajectory (params drifting) and NOT on a slow monotone climb; bench
reports steps/sec + convergence rate; reproducible from figure seed. Do not skip gates.
