# START HERE

You're bootstrapping the **diagram evolver** — a system that evolves random line segments
into faithful diagrams of a small dataset, under a principled homomorphism score. The full
theory is in `CONCEPT.md`; the build plan is in `ARCHITECTURE.md`.

## To begin a session

Put all of these files at the project root (`CLAUDE.md` must be at the root so it loads
automatically). Create an empty `handoffs/` folder. Then paste the **kickoff prompt** below.

## When context runs low

Type **`hand off`**. A self-contained resume file is written to `handoffs/`. Start a new
session, paste the kickoff prompt, and continue — nothing is lost.

---

## KICKOFF PROMPT (paste this into a new session)

```
This project is the "diagram evolver." Before doing anything, read these files at the
project root, in order:

  1. CLAUDE.md        — the constitution and the two cardinal principles
  2. PROGRESS.md      — current state; the single source of truth for where we are
  3. CONCEPT.md       — the conceptual + mathematical theory (the score is the product)
  4. ARCHITECTURE.md  — module map, tech stack, GUI spec, adversarial verification catalogue

If handoffs/ contains any files, also read the most recent one; it resumes the exact state.

Then operate under the two cardinal principles, which govern everything:

  I. DEPTH OVER PATCHES. Add every feature at the deepest correct layer. If a change belongs
     in the architecture, change the architecture — refactor rather than bolt on. A surgical
     patch that avoids a warranted structural change is a defect, not a shortcut. When unsure
     whether a change is deep or shallow, choose deep.

  II. WORKFLOWS OVER RE-DERIVATION. Build and verify through repeatable workflows — scripts,
     task runners, test suites — not by re-reading or re-deriving in-context. Prefer invoking
     a workflow to reconstructing knowledge. This holds for construction as much as
     verification. If you'd do the same multi-step thing twice, make it a workflow first.

Working mode: autonomous build–verify–iterate. For each unit of work — design it into the
architecture, implement it, write ADVERSARIAL tests that try to break its invariants, run the
test workflow, iterate until green, then record it in PROGRESS.md. Verification is the
approval: don't pause for sign-off on steps you can check yourself. A feature is "done" only
when tests that actively attempt to falsify it all pass.

Keep the math modular: every measurement, fidelity rung, and penalty is a registered,
swappable unit with its parameters in config.ts — the user edits the math directly. Penalty
terms ship wired but zero-weighted, never stubbed.

Start from PROGRESS.md's "Next action". Proceed through the milestones without skipping gates.
Do not ask me to approve individual self-verifiable steps; show me a working, tested result.
When I type "hand off", follow HANDOFF.md and stop.

Begin by confirming the current milestone from PROGRESS.md, then start work.
```

---

## What you'll be able to do once it's running (v1)

- Generate a **new figure seed** and a **new data seed** (independent), with both shown.
- Press run and **watch the twelve segments evolve** live into a bar chart, with the target
  dataset (labels **A…L**, ratio dollar values) displayed alongside and a live score
  breakdown (F_ord / F_int / F_ratio).
- On convergence, **save** the result (reproducible from its seeds), then start a new seed.

Later milestones turn on the penalty terms, enable **invention mode** (the figure chooses
its own encoding, so radial and dot-plot diagrams can emerge), and calibrate the weights.
