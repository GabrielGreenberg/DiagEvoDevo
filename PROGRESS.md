# PROGRESS.md — Living State

Single source of truth for *where we are*. Read this first every session; append to it in
the same session that work happens. Never reconstruct state that belongs here.

---

## Status: ✅ v1 COMPLETE (M0–M7). GUI live; random seeds evolve to faithful bar charts (quality→100%).

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

## Open questions
- Weight calibration units (`F_int` r² vs `F_ratio` exp-of-variance) — deferred to M10.
- Whether the posited frame's own origin/direction should be optimized or fixed in v1.
  Lean: fixed in M4–M7, optimizable later.
- BestAssignment cost when argmax runs every step — may need caching (revisit at M9).

## Next action
**v1 (M0–M7) is COMPLETE and verified.** `npm run dev` → live GUI; `npm run check` (140 tests) green;
`npm run bench` (24/24 seeds converge, mean quality 0.999); `npm run gradcheck` trusts the AD engine.
NOTE: v1 (penalties off) converges to bars "up to orientation/baseline" — the proportions + ordering +
live score breakdown are the fidelity evidence; clean VERTICAL bars need `frozenDof` (M8, one config flip).

Out of THIS run's scope (user chose M7 on 2026-07-01), available as the next run when desired:
- **M8 — First penalty on.** Set `config.penalties.frozenDof > 0` (already fully wired + tested);
  confirm it installs a shared baseline / common orientation → clean vertical bars emerge.
- **M9 — BestAssignment (invention).** Flip `config.assignmentPolicy = 'best'` (policy already built);
  confirm radial/dot-plot encodings emerge for suitable configs. May need argmax caching (perf).
- **M10 — Weight calibration.** Anchor `w_ord/w_int/w_ratio` to Cleveland–McGill (flagged open problem).
