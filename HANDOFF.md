# HANDOFF.md — Resume Protocol

Purpose: let the user reboot a fresh session with zero fuss and zero context loss when the
window gets low. Treat this like a skill triggered by the phrase **`hand off`**.

## Trigger

When the user types **`hand off`** (or "handoff"), do exactly this, then stop:

1. Read `PROGRESS.md` and the current code state. Make sure `PROGRESS.md` is fully current —
   append anything from this session not yet recorded (done items, decisions, open questions).
2. Write a new file `handoffs/HANDOFF_<UTC-timestamp>.md` using the **template below**,
   filled in for the current moment.
3. Output a one-line confirmation and the path. Do **not** continue working after a handoff.

The generated handoff must be **self-contained**: a fresh session that reads only it plus
the four core files (`CLAUDE.md`, `CONCEPT.md`, `ARCHITECTURE.md`, `PROGRESS.md`) can resume
with no other memory.

## Template

```markdown
# Handoff — <UTC timestamp>

## Resume in one step
Read, in order: CLAUDE.md · PROGRESS.md · this file. Then continue from "Next action".
CONCEPT.md and ARCHITECTURE.md are the reference; consult as needed, don't re-derive.

## Where we are
<current milestone; what was just completed; what is mid-flight (files touched, not yet green)>

## Next action
<the single concrete next step, and the gate that closes it>

## Live decisions / gotchas since last handoff
<anything a fresh session would otherwise rediscover the hard way>

## Open questions
<carried forward from PROGRESS.md, plus any new>

---
## Standing principles — reproduced verbatim, every handoff (do not paraphrase, do not drop)

### I. Depth over patches
Add every feature at the deepest correct layer. If a change belongs in the architecture,
change the architecture — refactor rather than bolt on. A surgical patch that avoids a
warranted structural change is a defect, not a shortcut. When unsure whether a change is
deep or shallow, choose deep, even at the cost of a larger refactor now.

### II. Workflows over re-derivation
Build and verify through repeatable workflows — scripts, task runners, test suites — not by
re-reading files or re-deriving results inside the context window. Prefer invoking a
workflow to reconstructing knowledge. This holds for construction as much as verification.
If you find yourself doing the same multi-step thing twice, make it a workflow first.

### Working mode
Autonomous build–verify–iterate: design into the architecture → implement → write
adversarial tests that try to break it → run the test workflow → iterate to green → record
in PROGRESS.md. Verification is the approval; don't wait for sign-off on self-checkable steps.
```

## Note
The two principles live here **and** in `CLAUDE.md` by design. Redundancy is intentional:
it is the mechanism that keeps them from eroding across sessions. If they ever conflict with
something else, they win.
