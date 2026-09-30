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

## Commits

- **Consider amend or squash before adding a commit.** A new commit is for a genuinely separate
  concern that should be revertible on its own — not for a fix to the commit you just made. If a
  change corrects your own earlier commit in the same series, that is a signal to amend.
- Name the **purpose first**, then the substance: what this makes possible or fixes, in plain
  words, before mechanism.
- One concern per commit, and do not push work you have not verified.

## Formatting

- Do not run formatters during Q&A, exploration, or when only documentation changed.
- Format once at the end, over the files you actually changed (for example `pint --dirty`).
- After auto-formatting, read the diff: never let unrelated formatting ride along.

## Stop conditions

Stop and ask when: the requirement is ambiguous in a way that changes the design; a rule or
invariant appears to contradict the codebase; the fix requires changing a public contract; or the
requested scope looks materially larger than it first appeared.
