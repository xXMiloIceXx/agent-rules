---
trigger: model_decision
description: "{{PROJECT}}'s commands, layout and local conventions. Read before running tooling or changing structure."
---

# Project Conventions — {{PROJECT}}

**This file is project-owned.** It is not vendored and `rules-sync` never touches it. The portable
layers live in the vendored files beside it; this file holds only what is true of *this*
repository. Companion file: [`project-truth.md`](project-truth.md).

## Commands

Fill these in from the manifests and the CI config. An agent should run the project's real
commands rather than an approximation — and know which ones mutate.

```bash
# install / build
# test — the full suite, a single test, and any excluded or slow group
# format — say which commands rewrite files and which only report
# lint
# static analysis
```

## Layout

State the real paths, **with their actual casing**:

- where domain logic lives;
- where entry points live;
- where pages / components / assets live;
- **directories the portable rules mention that do not exist yet** — say so, so an agent does not
  assume there is something to reuse when "extract this into a helper" would create it.

## Local traps

Anything this codebase has already got wrong once. Keep each entry concrete: what the trap is,
what it looked like in practice, and the fix. This is the highest-value section in the file —
it is the only place a past bug becomes a future rule.

## Release gate

- [ ] style / format check
- [ ] static analysis
- [ ] test suite, including any excluded group
- [ ] frontend lint and production build

## Working-tree discipline

The working tree may be shared with the user's own editor, so the checked-out branch can change
between turns. **Assert the branch in the same command that commits** — printing it is not enough.
