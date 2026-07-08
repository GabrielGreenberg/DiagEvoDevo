# Open threads — live, at the end of the strong-coincidence arc

Threads that are alive but not being worked right now. The first is PARKED by explicit user
instruction; the rest are the standing menu. Quote numbers from `PROGRESS.md`/logs, not memory.

---

## 1. THE TRANSPOSE ASYMMETRY — **PARKED for a dedicated session** (user's instruction this arc)

**The question (the user's own).** For the ratio (sales) relation, `length ≡ end-x` is an enacted
equation the score can reward — but so is `length ≡ end-y`. The canonical vertical bar chart
casts value onto *length/height*; a transposed (horizontal) chart casts it onto *end-x*. The
score, as built, does not uniquely prefer the canonical orientation. **Should it? And if so, at
which layer?** This is the user's open question. He asked that it be **deferred to a focused
session** rather than patched in tonight — so it is PARKED, deliberately, not forgotten.

**The established priors (do not re-derive — recorded here).**
- **Reward and bonus are relation-symmetric.** Nothing in the reward matrix or the coincidence
  bonus prefers the golden orientation. CONCEPT §7's empirical note records it directly: with the
  bonus on, 3–4/6 seeds build the full extent≡position stack but consistently for the **order**
  relation (heights ∝ rank), with sales taking a multi-anchor position cluster — the **transpose**
  of the canonical bar chart. At **seed 3 the transpose outscores the golden fixture 1.846 vs
  1.802**. "The score discovered that the canonical casting is not uniquely optimal."
- **end-x ≡ length formed in seed-5 strong but was cast for ORDER, not sales.** In the strong
  full-depth sessions the seed-5 optimum grounds every start on the y-axis to arrange
  `end-x ≡ run` and `start-y ≡ fr·start-dist` (eq = 1) — the identities are real and ink-witnessed,
  but they serve the ORDER relation's casting, not sales-onto-length. So the asymmetry is not "the
  score can't find end-x≡length"; it's "which relation the score chooses to hang on that identity
  is not pinned to the human convention."
- **The strong ink gate does NOT break the symmetry.** Strong coincidence rewards
  ink-witnessed identity regardless of which relation or orientation enacts it — a horizontal bar's
  length leg is as much real ink as a vertical bar's. So strong/0.2 does not, by itself, resolve
  the transpose question; it closes the *collapse* traps, a different defect.

**The hysteresis hypothesis (why the canonical might still win dynamically, unverified).** The
canonical orientation and its transpose may sit in distinct basins with a barrier between them;
which one an evolution lands in could be path-dependent (seed, anneal schedule, restart mutations)
rather than score-determined. If so, the "asymmetry" is an optimizer-dynamics fact, not an
objective-theory fact — and forcing the canonical orientation into the *score* would be the wrong
layer (Principle I: it would be a convenience hack against the mission's "discover kinds as
optima"). This hypothesis is UNTESTED. A dedicated session should (a) decide whether the user even
*wants* the score to break the symmetry, and only then (b) locate the correct layer.

**Status: PARKED.** Do not open casually. It needs a focused session with the user in the loop on
the normative question (should canonical win at all?), because the whole mission is discovering
kinds rather than hard-coding the bar chart.

## 2. M8 — movable frame (green-light pending)
Optimize the posited frame's origin/direction. **The most-ready milestone.** The carrier dedup is
already structural (cells un-merge correctly as the frame moves), and every strong measurement
path in `measurements/paths.ts` is derived against `cfg.frame`/`cfg.page` specifically so it
survives M8 by construction (point x/y from O and u/w, fr·dist radial from O, dogleg from d — all
frame-relative, nothing hard-codes the v1 axes). Revisit `frozenDof`/`economy` semantics once
frames actually move (their intent — shared baseline, common orientation — currently arrives via
data-ink plus the matrix). Awaiting the user's green light.

## 3. M10 — Cleveland–McGill calibration
Measure the salience resolutions θ per reading class (position > length > angle > area …) against
Cleveland–McGill decodability, instead of hand-tuning weights — the salience gate is the anchor's
principled home (CONCEPT §6). Also re-examine `w_ord/w_int/w_ratio` (the `w_int` r² vs `w_ratio`
exp-of-variance unit mismatch). **Registered M10 residue:** angle salience gates ANGULAR spread
only — a sub-pixel figure keeps readable-in-theory bearings (q ≈ 0.31 residue). Harmless today
(totals ≈0.13, far under every basin), but the principled fix is a **segment-length-aware angle θ**.

## 4. Angle arcs — strong coincidence for bearings
Bearings currently keep the WEAK coincidence formula even in strong mode: a bearing's ink is an
**arc**, not a linear segment, so it has no linear measurement-path. Strong coincidence for
bearings (dials agreeing about an angle in shared ink) awaits an **arc measurement-path theory**
(the arc's endpoints, an orientation-symmetric arc-overlap kernel, an arc-length ink gate).
Documented as future work in CONCEPT §7 and `paths.ts`. Origin-free page-point projections
(no ruler zero) likewise keep the weak formula in strong mode.

## 5. Characterizer vs new-kinds tension
The score keeps discovering **legitimate non-bar kinds** that out-rank the golden fixture on
reward — this is the mission's "discover kinds as optima" behavior, not a bug, but it stands in
tension with any fixture-anchored characterizer/acceptance gate. Instances found across the arc:
- Acceptance gate-5 optima: a **spoke/comet plot** (seeds 1/3/5 — order = start-distance-from-
  frame-origin, value = end-distance), horizontal ticks (seed 2), grounded near-vertical bars
  (seed 4); several beat golden (0.796).
- Strong loophole hunt: a **stacked-on-axis cumulative chart** (start-y ≡ fr·start-dist by
  construction + order via start-y) out-scores small-K golden **1.58 vs 1.46 on REWARD** (wins
  even at w=0) — a legitimate discovered kind, same family as the spoke/comet finding, not a bonus
  artifact.
- Circular-rung ranking: the **tilt chart** (x ∝ rank, equal lengths, bearing ∝ value) is the
  closest non-bar at 1.299 vs golden 1.745/1.766 — a legitimate v2.2-enabled encoding.
The open thread: as the kind-space widens, keep the acceptance gates honest about "golden is *a*
strong optimum" rather than "golden is *the* optimum," and keep the characterizer descriptive.

## 6. Performance
Strong coincidence is a **~2× tape** vs weak (**61,053 vs 31,293 nodes** on the budget test,
×1.95 ≤ 2.2 cap); full `npm run accept` runs **~19–21 min/seed** at the strong tape. rAF
throttling already handles hidden/background tabs (the GUI does not burn cycles when not visible).
Open hot-path levers if the GUI or bench needs them: reuse each measurement's `extractValue`
across both relations; cache the per-unordered-pair strong overlaps (already cached once per pair
across relations); cut the 66-pair fOrd loops; skip the coincidence tape entirely at weight 0
(already done — weight 0 is bit-exact with the pre-feature HEAD). Gate: bench wall-time ↓ with
`npm run check` + `npm run accept` still green.

---

### Pointers
- Live math: CONCEPT §§6 (fidelity ladder + salience gate), 7 (LSE aggregation + coincidence,
  weak & strong), 8 (data-ink).
- Verification catalogue + module map: ARCHITECTURE (§Verification carries the strong-coincidence,
  circular-rung, and dial-fixture/anti-cliff invariant blocks; module map includes `paths.ts`).
- Living state + full numbers: PROGRESS.md (top Status block = strong/0.2 certification).
- Scratch probes for every adversarial pass are preserved in `scratch/` (outputs in `scratch/*.out.txt`);
  reuse as-is, never modify the audit probes.
