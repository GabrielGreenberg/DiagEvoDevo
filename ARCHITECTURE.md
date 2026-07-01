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
    scale.ts                 ScaleType {ordinal,interval,ratio,cyclic}; the "reads-down" order;
                             commensurability(dataType, stamp) legality check.
    data.ts                  DataSet = labels A..L (ordinal) + values ℝ⁺ (ratio).
                             seedToDataSet(seed): deterministic positive values.
    figure.ts                Figure = Float64Array(48) (12 segments × [sx,sy,ex,ey]).
                             seedToFigure(seed); accessors for start/end/midpoint/displacement.
    frame.ts                 Page (direction, no origin) and PositedFrame (origin+direction).
                             A frame's parameters may themselves be fixed or optimized later.
    measurements/
      types.ts               Measurement = { id, anchor, part, reading, stamp: ScaleType,
                                             extract(figure): Float64Array(12) }.
      registry.ts            Builds the 2×4×4 stock; marks the 6 undefined; exposes the 26 live.
      readings.ts            proj∥, proj⊥, magnitude, angle as pure vector ops.
    fidelity/
      ladder.ts              fOrd, fInt, fRatio: (c, v) → [0,1]. Exact + differentiable forms.
      rungs.ts               Registered rungs with weights; height-cap by data ScaleType.
    assignment.ts            Assignment policy interface; FixedAssignment; BestAssignment(argmax).
    penalties/
      registry.ts            Registered penalty terms, configurable weights (default 0).
      spuriousness.ts        Overencoding term (off by default, fully wired).
      frozenDof.ts           Var(baseline) + circularVar(tilt) (off by default, fully wired).
      economy.ts             Frame/measurement count (off by default, fully wired).
    score.ts                 S = reward(assignment) − Σ penalties. Returns {total, breakdown}.
    gradient.ts              Runs the score forward on Value-leaves, calls backward(), collects
                             the 48 leaf grads into ∇S for the optimizer. (Engine: core/autograd.)
  optim/
    gd.ts                    Adam / plain GD stepper over the 48-vector.
    evolve.ts                Outer layer: random restarts + mutation for global structure
                             and discrete assignment search.
    session.ts               Orchestrator: seed → init → step loop → convergence → result.
    converge.ts              Plateau detection on SCORE (not params — optimum is a valley).
  persistence/
    store.ts                 Save/load a Result {figureSeed, dataSeed, figure, data, score,
                             config-snapshot} to disk/JSON. Results are reproducible from seeds.
  ui/
    canvas.ts                Renders the evolving figure (12 segments).
    dataPanel.ts             Renders the dataset clearly: labels A..L + values, as a reference
                             view. This is the target, shown beside the figure.
    scorePanel.ts            Live score + per-rung breakdown per assignment.
    controls.ts              New Figure Seed · New Data Seed · Run/Pause · Step · Reset ·
                             Save · Load. Seeds shown and editable.
    app.ts                   Wires the loop to requestAnimationFrame and the store.
  main.ts
```

### Modularity contract (Principle I in practice)
- A new **measurement** = one entry in `readings.ts` + registry; nothing else changes.
- A new **rung** or a changed fidelity formula = one function in `fidelity/`, written against
  the autograd `Value` type; the ladder, score, and gradient pick it up unchanged — its exact
  gradient follows automatically, with no gradient code to edit.
- A new **penalty** = one file in `penalties/` + registry entry; `score.ts` already sums
  the registry. It ships **wired but zero-weighted**, never commented out or stubbed.
- No tunable constant appears outside `config.ts`.
- `fidelity/`, `penalties/`, and `score.ts` are written against the autograd `Value` type, so
  differentiation flows end-to-end from the 48 leaves. A plain-number path exists only for
  displaying exact metrics; the optimized path is always the differentiable one.

---

## GUI specification

A single screen, two panes:

- **Figure pane (left):** the twelve line segments on a canvas, redrawn each frame as they
  evolve. Show the posited baseline/frame if one is active. Convergence visibly settles.
- **Data pane (right):** a clear, static representation of the *dataset* being targeted —
  labels **A, B, C, … L** along the ordinal axis, their ratio (dollar) values shown as a
  reference. This is the ground truth the figure is trying to become; keep it legible and
  separate from the evolving figure.
- **Score readout:** current total, plus the per-assignment rung breakdown
  (`F_ord / F_int / F_ratio` for the sales carrier, `F_ord` for the order carrier), updating
  live so the user watches the terms fight and settle.

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

**Fidelity ladder**
- `F_ratio(k·v, v) = 1` for all `k>0`; `F_ratio(v², v) < 1`.
- `F_int(a·v + b, v) = 1` for all `a>0, b`; `F_int(v², v) < 1`.
- `F_ord(monotone↑(v), v) = 1`; `F_ord(reverse(v), v) = 0`; invariant under any monotone
  transform of `c`.
- **Nesting:** on random samples, `F_ratio=1 ⇒ F_int=1 ⇒ F_ord=1` (never violated).
- Differentiable `F_ord` surrogate → exact `F_ord` as `T → 0`.

**Scale / commensurability**
- `commensurability(dataType, stamp)` accepts iff `dataType ≤ stamp`; rejects month→interval-only
  reads and any cross-type comparison.
- Every scored comparison is between two length-12 vectors of compatible type (a
  cross-reading vector cannot be constructed through the public API).

**Measurements**
- Exactly 26 live of 32; the 6 undefined are precisely `page × {start,end,midpoint} ×
  {magnitude,angle}`.
- `length` identical under both anchors; run/rise/tilt identical iff frame ∥ page.
- Scale census is 15 ratio / 6 interval / 5 cyclic.

**Score & gradient**
- Score invariant to global scale `k` and horizontal translation (numerically, to `ε`).
- **Golden bar chart:** a hand-built perfect bar chart scores the max reward under
  FixedAssignment; small perturbations along non-invariant directions strictly lower it;
  perturbations along invariant directions leave it unchanged.
- **Autograd trusted via finite differences:** for each primitive op and for the full score,
  `‖∇_autograd − ∇_finite‖ < ε` on random inputs. This is the only role finite differences play.
- Autograd gradient points downhill: a small step along `−∇S` decreases `S` for random figures
  away from optima.

**Optimizer**
- From ≥ N random seeds under FixedAssignment, converge to score ≥ threshold; converged
  figures are bar charts up to the known invariances.
- Convergence detector fires on score plateau even while parameters still drift along the
  invariant valley.

**Penalties (even while zero-weighted)**
- Each penalty term computes a sane value on hand-built inputs (e.g. `frozenDof` > 0 for a
  figure with drifting baselines, = 0 for a shared baseline) so that enabling a weight has
  the intended effect with no code change.

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

Prefer invoking these over re-deriving. If a construction step repeats, make it a workflow
before doing it twice.
