# PROGRESS.md — Living State

Single source of truth for *where we are*. Read this first every session; append to it in
the same session that work happens. Never reconstruct state that belongs here.

---

## Status: M0 COMPLETE (autograd engine built + gradchecked). M1 in progress.

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
- [ ] **M1 — Data & Figure.** `data.ts`, `figure.ts`, seed generators, scale metadata.
      Gate: seed→dataset/figure deterministic; property tests on ranges.
- [ ] **M2 — Scale & measurements.** `scale.ts`, measurement registry, the 4 readings,
      the 2×4×4 stock with the 6 undefined. Gate: census + coincidence invariants.
- [ ] **M3 — Fidelity ladder.** `fOrd/fInt/fRatio` (differentiable forms written against the
      autograd `Value` type), exact forms for display, rungs + weights, data-capped height.
      Gate: all ladder + nesting invariants.
- [ ] **M4 — Assignment & score.** commensurability, FixedAssignment, `score.ts` with the
      penalty registry (terms wired, zero-weighted). Gate: golden bar chart scores max;
      scale/shift invariance.
- [ ] **M5 — Gradient wiring.** Collect the 48 leaf grads from the score graph into the
      optimizer-facing ∇S; gradient-goes-downhill test. (Engine already built in M0.)
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
- **Baked-in v1 decisions** (from the approved plan): posited frame FIXED (∥ page) in v1;
  FixedAssignment sales→length (#9, no frame), order→x-position (#1); weights w_ord=1<w_int=2<w_ratio=4;
  one differentiable code path (plain-number path only for display; sole value-fork is exact F_ord).

## Open questions
- Weight calibration units (`F_int` r² vs `F_ratio` exp-of-variance) — deferred to M10.
- Whether the posited frame's own origin/direction should be optimized or fixed in v1.
  Lean: fixed in M4–M7, optimizable later.
- BestAssignment cost when argmax runs every step — may need caching (revisit at M9).

## Next action
M1 — Data & Figure. Implement `data.ts` (seedToDataSet: 12 positive ratio values, labels A..L),
`figure.ts` (Float64Array(48), canonical `[sx,sy,ex,ey]×12` index layout as a shared constant,
seedToFigure, accessors for start/end/midpoint/displacement), `frame.ts` (Page + fixed
PositedFrame). Adversarial gate: determinism (byte-identical across runs from same seed), strict
positivity of data values, endpoints within the init box, different seeds differ. Do not skip gates.
