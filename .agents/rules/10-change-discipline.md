---
trigger: model_decision
description: "How to shape and land a change: diff size, revertibility, commit structure, formatting frequency, and when to stop and ask."
---

# Change Discipline

## Shape of the diff

- Smallest change that fully solves the stated problem. Prefer reusing an existing helper,
  service, trait or component over introducing a parallel one.
- One concern per change. If you notice an unrelated defect, report it instead of folding it in.
- Keep every change revertible: a reviewer must be able to undo it without unwinding anything else.
- **A new convention applies to new code, code you are already changing, and code reviewed after
  it takes effect.** It does not license an unrelated legacy rewrite. Say so rather than letting
  the diff grow.

## Commits

- **Consider amend or squash before adding a commit.** A new commit is for a genuinely separate
  concern that should be revertible on its own — not for a fix to the commit you just made. If a
  change corrects your own earlier commit in the same series, that is a signal to amend.
- Name the **purpose first**, then the substance: what this makes possible or fixes, in plain
  words, before mechanism.
- One concern per commit, and do not push work you have not verified.

## Abstractions

- Extract duplication when the second real use arrives, not when it is imagined. **Do not
  over-abstract.**
- Keep the blast radius small: a change should not force edits in unrelated callers.
- When introducing a generic mechanism or an automated inference, always leave an explicit
  override or configuration path for the case the automation gets wrong — roughly 80% automated,
  20% escape hatch. A generic inference with no manual override becomes a blocker the first time
  it is wrong.
- When modifying a **shared** composable, middleware, utility or trait, verify it end-to-end
  against the most complex real consumer in the codebase, not the simplest one.

## Comments and documentation

- Do not write comments that restate the code.
- Do document **business rules, side effects, assumptions and limitations** — the things a reader
  cannot recover from the code alone.

## Formatting

- Do not run formatters during Q&A, exploration, or when only documentation changed.
- Format once at the end, over the files you actually changed (for example `pint --dirty`).
- After auto-formatting, read the diff: never let unrelated formatting ride along.

## Stop conditions

Stop and ask when: the requirement is ambiguous in a way that changes the design; a rule or
invariant appears to contradict the codebase; the fix requires changing a public contract; or the
requested scope looks materially larger than it first appeared.
