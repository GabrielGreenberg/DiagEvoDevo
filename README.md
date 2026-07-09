# Diagram Evolver

A system that starts from a random configuration of line segments and, guided **only** by a
principled scoring function, evolves it into a faithful diagram of a small dataset. The score
is not a heuristic — it is a formal account of when a figure is a good **homomorphism** of its
data: when geometric relations among the figure's segments track the data's relations among its
values. The long-run ambition is to let diagram *kinds* (bars, dot plots, radial dials, ticks,
spoke plots, …) **emerge as optima of the score** rather than to hard-code any of them. The bar
chart is the first target only because it is the optimum we can check by hand; the architecture
deliberately does not privilege it.

> Research instrument, work in progress. The math is the product; the code serves it. License is
> not yet chosen — treat it as **all-rights-reserved / TBD** until a `LICENSE` file appears.

> **Deploy:** it is an installable, offline-capable PWA. Publish to Netlify, Vercel, or Cloudflare
> Pages (root-served over HTTPS) — one-page guide in [`DEPLOY.md`](DEPLOY.md).

---

## The idea

The dataset is twelve items labelled **A … L**, each carrying a positive value. It is a *product*
of two independent relation families: **order** on the labels (ordinal) and **value** per item
(ratio, with a true zero). The figure is twelve line segments — each a start point plus an end
point, four numbers — so the whole figure is a **48-dimensional parameter vector**. That vector
*is* the thing the optimizer moves. A label bijection pairs segment A with item A, and so on; the
labels carry identity only, never magnitude.

### The funnel

Scoring runs each data relation, like-with-like, against every commensurable way of reading the
figure:

```
48 free parameters
  → 312 live measurement-values      (26 live census measurements × 12 segments)
  → 16 distinct carriers             (structural dedup of the 26-cell census under the fixed frame)
  → salience-gated cells             (a per-carrier reader model)
  → per-relation smooth-max (LSE)    (one excellent carrier dominates; more matches still help)
  → reward  +  coincidence bonus  −  data-ink penalty
  = one score
```

Each carrier is graded on a **fidelity ladder** — `ordinal ≤ interval ≤ ratio ≤ cyclic` — whose
rungs are chance-corrected and direction-symmetric (a reversed axis or a mirrored encoding is
still legible). Within a relation the carriers aggregate by a **log-sum-exp smooth-max** (β = 8),
not a sum: this is what forces a *division of labour* — order gets carried by some carriers, value
by others — instead of the degenerate "make everything proportional to value" mush that a linear
sum rewards. Each relation is normalized to `[0, 1]`, so no relation drowns the others.

### The reader model (salience)

A fidelity that only measured correlation would credit sub-pixel, unreadable structure. So every
cell passes through a **salience gate** `s = Var / (Var + θ²)` per unit class: a carrier that
varies less than the legibility scale θ earns ≈ 0 no matter how well it correlates. This gate is
the principled home of a future Cleveland–McGill perceptual calibration (milestone M10) — the plan
is to *measure* θ per reading class, not to hand-tune weights.

### Enacted equations (coincidence)

Two carriers *proportional* to the same relation are correlational doubling — the smooth-max
already credits that. But a figure can go further and **arrange two reading procedures to return
the same number in the same page units** (grounded vertical bars make `end-y ≡ rise ≡ length`;
verticality makes `start-x ≡ end-x ≡ mid-x`). Equality is the rung above ratio — shared zero plus
shared unit, which is what an axis *is* — and it earns a separate **coincidence bonus** that sits
outside the quality score so legibility comparisons stay interpretable.

- **Weak** coincidence rewards two readings returning the same *magnitude* (a 12-vector match).
- **Strong** coincidence additionally requires the two readings to trace the **same ink path** on
  the page (an alignment kernel × an ink gate). This closes a blind spot of the weak version: the
  weak same-magnitude test cannot distinguish an axis-by-construction from a collapse-by-degeneration
  (a dot plot collapses every segment to a point, making `start ≡ mid ≡ end` coincide "for free").
  Strong mode gives a collapsed segment an ink-gate of exactly 0, so no coincidence is earned.

**Strong coincidence at weight 0.2 is the certified default.** Full `npm run accept` under the
strong default: **49/49 checks, division of labour 6/6, legible 6/6**, full-depth per-seed quality
0.799–0.807. Weak mode remains selectable in the UI and config, and builds a bit-identical tape to
the pre-strong scorer when its weight is 0.

### Kinds discovered so far

Running the real optimizer to convergence on different seeds (nothing hard-coded) yields distinct
diagram kinds as optima. From the acceptance sessions (data seed 1, seeds 1–6):

| Seed(s) | Emergent kind | How it encodes |
|---|---|---|
| 1, 3, 5 | spoke / comet plot | order = start-distance-from-frame-origin, value = end-distance |
| 2 | horizontal ticks | order = end-x, value = end-y |
| 4 | grounded near-vertical bars | order = rise, value = start-distance |
| — | grounded parallel bars / ticks | the checkable golden target (quality ≈ 0.796) |
| — | axis-grounded chart (strong mode) | starts grounded on the y-axis to arrange `end-x ≡ run` and `start-y ≡ fr·start-dist`, `eq = 1` |

Several of these *beat* the golden bar chart on the score — the mission's intended "discover kinds
as optima" behaviour, not a bug.

---

## Quickstart

**Prerequisites:** Node 18+ (developed on Node 25; the app is browser-only TypeScript — no backend,
no native deps). Install:

```bash
npm install
```

### Run the GUI

```bash
npm run dev        # Vite dev server at http://localhost:5173
```

A single screen: the evolving figure on a **fixed viewport** canvas (the frame never appears to
move) on the left, panels on the right, and a trajectory gallery below.

- **Controls:** `figure seed` and `data seed` (independent, editable) · **Run/Pause · Step ·
  Reset · Save · Load**. `max steps` sets the per-trajectory step cap (raising it live un-caps
  capped trajectories); `plateau eps` is the convergence-flatness threshold — smaller is stricter,
  so runs continue longer.
- **Target dataset** panel: labels A … L and their values — the ground truth the figure is trying
  to become.
- **Readings** strip (collapsible): one chip per distinct carrier; disable readings (e.g. all mid
  points, or rise/run) to explore what optima emerge without them. Toggles persist and apply at the
  next Reset.
- **Reinforcement** panel: a `matches` toggle (aggregation) and a three-state `off / weak / strong`
  coincidence selector. Both apply at the next Reset.
- **Score** panel: the honest headline quality (≈ 0 for a random figure), per-relation blocks over
  the distinct carriers with per-rung mini-bars (τ signed ↑/↓, r², ∝) and a salience chip per row,
  coincident-pair lines with ink factors, and the data-ink penalty row.
- **Trajectory gallery:** every trajectory ever started, each played out independently and frozen
  as an endpoint (no mid-run splicing); the main canvas follows your selected one. The first cell
  is a permanent **reference** — the golden bar chart of the current dataset, scored under the live
  objective. **Save** stores the selected result (reproducible from its seeds + a config snapshot).

### Verify

| Command | Verifies | Rough runtime |
|---|---|---|
| `npm run check` | typecheck + lint + full Vitest suite (390 tests) | ~1–2 min |
| `npm run gradcheck` | autograd gradients match finite differences on every primitive **and** the full score | seconds |
| `npm run bench` | headless convergence/speed over a batch of seeds | ~1 min |
| `npm run accept` | the 6 adversarial acceptance gates (gate 5 runs the full optimizer; `--quick`/`--seeds=` only for debugging — final acceptance runs unflagged) | ≈ 40 min (weak) / ~2 h (strong default, ~20 min/seed × 6) |
| `npm run build` | `tsc -b` + `vite build` production bundle | seconds |

`npm run accept` **is** the certificate: gates 1–4 rank the golden bar chart above the audit's
winning degenerates, check smooth-max monotonicity, the salience floor, and signed-ratio behaviour;
gate 5 runs the real optimizer on seeds 1–6 and asserts a division of labour (some salient carrier
reaches τ_sym ≥ 0.9 for order **and** some reaches ratio ≥ 0.9 for value) with legible dumps;
gate 6 is `npm run check` + `gradcheck` green.

---

## Architecture map

Module boundaries mirror the *conceptual* seams, so editing the math means editing one small pure
module. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full spec and the adversarial invariant
catalogue, [`CONCEPT.md`](CONCEPT.md) for the theory, and [`PROGRESS.md`](PROGRESS.md) for living
state.

| Module | Role |
|---|---|
| `config.ts` | Single source of every weight, temperature, seed, and hyperparameter. |
| `core/autograd/` | In-house reverse-mode automatic differentiation; the 48 leaves → exact ∇S via one `backward()`. Differentiates whatever score you write, so no gradient is hand-maintained. |
| `core/scale.ts` | Scale types and the reads-down chain `ordinal ≤ interval ≤ ratio ≤ cyclic`; commensurability legality. |
| `core/data.ts` · `core/figure.ts` · `core/frame.ts` | Dataset (labels + ratio values), the 48-vector figure with accessors, and the page/posited-frame geometry. |
| `core/measurements/` | The 26-of-32 measurement stock, the readings (proj∥, proj⊥, magnitude, angle), the structural dedup into distinct carriers, and (strong coincidence) measurement paths. |
| `core/fidelity/` | The fidelity ladder (`τ_sym`, `r²`, signed-safe ratio, circular Mardia rung) and rung composition — written against the autograd `Value` type. |
| `core/penalties/` | Registered penalty terms; **data-ink** (`spuriousness`, on by default) charges salient carriers that track nothing; `frozenDof`/`economy` wired at weight 0. |
| `core/score.ts` · `core/gradient.ts` | Per-carrier cells → per-relation LSE → reward + coincidence − penalties; collects the 48 leaf gradients for the optimizer. |
| `optim/` | Adam stepper, the multi-start trajectory pool (independent played-out trajectories, no adoption/culling), plateau-on-score convergence, and the session orchestrator. |
| `persistence/` | Save/load a `Result` (reproducible from seeds + config snapshot). |
| `ui/` | Canvas, data panel, score panel, controls, Readings strip, reinforcement panel, and the trajectory gallery. |
| `scripts/accept.ts` · `scripts/bench.ts` | The adversarial acceptance gates and the headless bench. |

---

## Status & roadmap

**Shipped:** scoring v2 → v2.1 → v2.2 (audit-driven redesign of objective, optimizer, and UI);
structural carrier dedup (16 distinct); the played-out-trajectory optimizer; circular rungs restored
(dials/gauges score interval via a wrap- and rotation-invariant Mardia circular–linear R²); the
coincidence bonus; and **strong (same-ink-path) coincidence certified as the default** (strong/0.2:
49/49 accept, 6/6 division of labour, 6/6 legible). 390 tests green.

**Open (milestones):**

- **M8 — movable frame.** Optimize the posited frame's origin/direction; the dedup layer is already
  structural and ready, but converge/economy semantics under moving frames aren't designed yet.
- **M9 — invention mode.** `BestAssignment` argmax over legal assignments; confirm radial/dot
  encodings emerge for suitable configs.
- **M10 — perceptual calibration.** Measure the salience resolutions θ per reading class against
  Cleveland–McGill decodability; re-examine the `w_ord < w_int < w_ratio` weights.
- **Known residues:** angle ink-paths still use straight legs (arcs are future work); the
  transpose-casting asymmetry between the two relations; the ordinal-from-bearings ±π branch cut (a
  documented, bounded limitation); and characterizer evolution.

---

## Reproducibility

Every result is reproducible from its seeds. All randomness — datasets, initial figures, mutation,
restarts, and the gradient-check draws — flows through one seeded PRNG (`core/rng.ts`, mulberry32),
so a `figure seed` + `data seed` + config snapshot fully determines a run. Gradients are trusted
via finite differences only (the `gradcheck` workflow), never used to compute the optimizer's
step. The acceptance gates (`npm run accept`) are the standing certificate that the objective still
prefers legible diagrams; the current certificate of record is strong/0.2.
