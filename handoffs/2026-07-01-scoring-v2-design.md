# Scoring v2 — design record (2026-07-01)

Derived from the 87-agent adversarial audit (all findings below CONFIRMED by ≥2/3 independent
verifiers with numeric reproductions; scripts in `scratch/`). This file is the build spec.
CONCEPT.md/ARCHITECTURE.md are updated to match by the docs pass; after that this file is a
historical record.

## Why (confirmed diagnosis)

The optimizer is fine (fixed mode reaches quality 0.999; gradients clean; annealing sound).
The comprehensive **objective itself** prefers illegible figures:

1. **Optimum is degenerate mush.** Hand-built "everything ∝ value" figures score 1.40/2.0 vs the
   perfect bar chart's 1.17/2.0; Adam started FROM perfect bars walks away, corrupting bar heights.
2. **Linear sum has zero division-of-labor pressure.** At ord/int rungs, compromise frontiers sum
   to exact constants; sales outbids order on every carrier (marginal 0.041 vs 0.019); optimum
   assigns ZERO carriers to order.
3. **Fidelity is resolution-free.** All rungs are scale/affine-invariant, so "perfect" carriers can
   be sub-pixel. Seed 1's order carrier τ=0.97 spans 21 units under 109-unit segments. The score
   certifies encodings no reader can see.
4. **fOrd's 1/spread normalization explodes**: flat carriers dominate the order gradient ~1e8×,
   actively tearing apart the constancies (baseline, tilt) legibility needs.
5. **fRatio's positivity clamp** gives all-negative carriers a FREE constant reward
   (exp(−Var(log v)/σ₀²)≈0.18, zero gradient) and a reward valley blocks sign-crossing; 15/20
   sales carriers are signed → the heaviest rung is dead or perverse on them.
6. **fInt=r² is sign-blind** → anti-encodings earn full interval reward with zero ordinal reward
   (nesting violation, stuck anti-plateaus).
7. **Cyclic-on-top is unsound as implemented**: raw atan2 bearings into linear stats → branch-cut
   cliffs (reward 5.56→0.84 for a 0.002 rad rotation), dead zones, mirrored dials score ~0.
8. **10 of 26 measurements are exact duplicates** under the v1 frame (∥ page at origin): only 16
   distinct carriers; 16 projection rows have rank 4. Double-counting + fake "N tracking".
9. **Chance floors hidden**: constant carrier scores F_ord=0.5; random figures show quality ~33%,
   order ~50%. Order's usable range ~0.15 vs sales ~0.74.
10. **Penalties all weight-0** → even numerically perfect fixed-mode encodings render as
    pick-up-sticks (nothing quiets meaningless variation).
11. Optimizer margins: adoptMargin 0.05 ≥ max single-cell jump (never fires); mutation branch dead
    at pop 4; restarts culled 1/119; restartOnStall/maxRestarts are dead knobs.

User's four live observations, explained: no grounding (frozen carrier = lost mean-reward, so the
score RESISTS grounding); layout sorts by value (sales outbids order everywhere); frame appears to
move vertically (canvas refits viewport per frame); resets (champion adoption splices trajectories).

## The v2 score

Per data relation R with data v, over the **deduped distinct carrier set** M(cfg):

```
cell q_m(R)  = salience(c_m) · Σ_rungs w_r · F_r(c_m, v) / maxRung(R)      ∈ [0,1]
relation(R)  = (1/β) · log( mean_m exp(β · q_m(R)) )                        ∈ [0,1]   (LSE, β≈10)
reward       = Σ_R relation(R)                                              ∈ [0, #relations]
penalty      = w_ink · mean_m [ salience(c_m) · (1 − maxSmooth_R q_m(R)) ]  (data-ink / spuriousness)
S            = reward − penalty ;  quality = reward / #relations
```

- **LSE aggregation** replaces the flat sum: one perfect carrier dominates; every additional
  matching carrier still strictly raises the score (user's "more matches wins" preserved as a
  strict-monotone bonus, no longer as a linear trade against perfection).
- **Salience gate** s = Var(c)/(Var(c)+θ²), θ per unit class (θ_len in page units for
  positions/lengths; θ_ang in radians for angles). A carrier below reader resolution earns ~0 and
  is not worth ink. This is the reader model the fidelity theory lacked (principled home of the
  M10 Cleveland–McGill anchor).
- **Data-ink penalty** (new semantics of `spuriousness`, on by default): salient variation that
  carries no relation is fabricated structure → penalized. Gives grounding/parallelism/quiet-DOF
  pressure without hard-coding any chart form. `frozenDof`/`economy` stay registered at 0.
- **Chance-corrected, direction-symmetric rungs** (legibility is decodability up to axis
  direction — a reversed axis is readable):
  - ordinal: `τ_sym = |2·F_ord − 1|` (smooth |·|), 0 at random/constant, 1 at sorted either way.
    Surrogate margin denominator floored at a **legibility scale**: spread' = max(spread(c), ℓ_min)
    → kills the 1e8 gradient explosion AND the sub-pixel-order loophole (sub-legible ≈ ties).
  - interval: r² (already symmetric; chance 1/(n−1)≈0.09 accepted, documented).
  - ratio (signed-safe, replaces the clamp): `F_ratio = exp(−Var(log√(c²+ε) − log v)/σ₀²) · coh(c)`
    with `coh(c) = |2·mean_i σ(c_i/(κ·spread(c))) − 1|` (smooth). Magnitude carries proportion; a
    coherent sign (either sign — mirrored encodings legible) is required; smooth gradient across 0;
    no free reward for degenerate carriers. Nesting restored in the symmetric sense.
- **Cyclic demoted**: reads-down = ordinal ≤ cyclic ONLY (drop interval/ratio ≤ cyclic). Bearings
  may carry order (user choice 2's intent) but not ratio until genuine circular rung forms exist
  (registered open question; branch-cut on ordinal-from-bearings documented as a known limitation).
  Sales matrix: 20 → 15 cells (pre-dedup).
- **Registry dedup**: carriers(cfg) merges extensionally-equal cells derived from the frame/page
  geometry (frame ∥ page at origin ⇒ frame projections ≡ page projections; displacement cells are
  anchor-free ⇒ page ≡ frame). Merged cell keeps the highest stamp and lists its aliases. relMax,
  panel counts, and the LSE mean run over DISTINCT carriers. Rule is structural, so it stays
  correct when frames move (M8+).
- **Plain-English labels** on every measurement (user request): `start x`, `start y`, `end x`,
  `end y`, `mid x`, `mid y`, `run`, `rise`, `length`, `angle`, frame variants prefixed `fr·` —
  no more ∥/⊥/disp/mag glyphs in the UI.
- `fixed` mode kept, scored with the same v2 ladder (salience + symmetric rungs) for comparability.

## Optimizer v2 (user directive: "let each evolution play out")

Multi-start, **no adoption, no mid-run culling**: populationSize independent trajectories, each
with its own Adam state, its own anneal clock, its own plateau detector. A trajectory that
plateaus (or hits per-trajectory cap) is FROZEN as an endpoint. Freed slots start replacements
(alternating fresh-random / mutation-of-best-endpoint) until maxRestarts is exhausted. Session
result = best endpoint by exact score. UI shows every trajectory (thumbnail strip) so the user
watches each one play out; the main canvas follows the best. Fixes: dead mutation branch, dead
restart knobs, adoption granularity — all replaced, not tuned.

## UI v2

Plain labels; per-rung mini-bars (τ signed with ↑/↓, r², ratio) + salience chip per carrier row;
distinct-carrier counts; data-ink penalty row; honest headline (quality is now ~0 for random
figures by construction — chance floors removed at the source); FIXED viewport (page box + margin,
no per-frame refit — the frame stops "moving"); byCap shown live; trajectory strip.

## Acceptance gates (adversarial, in `scripts/accept.ts`, workflow `npm run accept`)

1. Fixture ranking under the v2 score: label-ordered golden bars **beat** value-sorted bars,
   nested-ray, value-spiral, collinear-pileup, random (the audit's winning degenerates, kept as
   regression fixtures from scratch/audit_compare.ts).
2. Monotonicity: adding a matching carrier never lowers a relation score; one perfect+salient
   carrier beats many mediocre ones.
3. Salience: a sub-threshold (sub-pixel) perfect carrier earns ≈0; growing its spread recovers it.
4. Signed ratio: mirrored bars score full ratio; mixed-sign carriers don't; no NaN anywhere
   (degeneracy suite preserved).
5. Sessions on seeds 1..6: some salient carrier reaches τ_sym ≥ 0.9 for order AND some salient
   carrier reaches ratio ≥ 0.9 for sales (division of labor), and segment dumps look legible.
6. `npm run check` fully green; gradcheck passes (LSE & smooth-abs built from existing primitives).

## Config additions (all in config.ts)

`aggregation.beta` (10) · `salience.thetaLen` (10 page-units) · `salience.thetaAngle` (0.35 rad) ·
`legibility.spreadFloorLen` (2) / `spreadFloorAngle` (0.05) · `ratioSign.kappa` (0.2) ·
`penalties.spuriousness` → data-ink semantics, default 0.25 · evolve: drop adoptMargin, add
`mutateFraction` (0.5); converge.windowSize 50→80.

## Softened prior user choices (flagged, not silently dropped)

- (1) "sum within a relation" → LSE: monotone more-matches bonus kept; linear trade removed
  (confirmed root cause of mush optimum).
- (2) "order readable from angles / cyclic on top" → intent kept (ordinal ≤ cyclic); the unsound
  ratio-from-raw-bearing edge removed until circular rung forms exist.
