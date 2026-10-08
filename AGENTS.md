# Agent Rules (Portable Base)

This repository **is** the rule base. Opening it as a workspace uses its own rules; a consuming
project pulls them in through `.agents/rules.json` `inherits` instead of copying files.

**Precedence:**

1. The consuming project's own overlay — its verified facts (versions, runner, what it does *not*
   have). A project overlay always wins over this base.
2. This repository's `.agents/rules/*.md`.

## Core rules — always on

| Read | Why |
| :--- | :--- |
| `.agents/rules/00-core.md` | Priority order, rule precedence, the execution protocol, evidence discipline, minimal change |
| `.agents/rules/01-security.md` | Trust boundaries, authorization, injection, secrets, uploads |
| `.agents/rules/02-axioms.md` | The recurring bug classes: falsy values, orphaned dependents, action-scoped rules, cross-mode drift |

## On-demand rules — loaded when the task matches

| When | Read |
| :--- | :--- |
| Shaping or landing a change (diff size, commits, abstractions, formatting) | `.agents/rules/10-change-discipline.md` |
| Writing or changing tests | `.agents/rules/11-testing.md` |
| Reviewing, debugging or refactoring | `.agents/rules/12-review-debugging.md` |
| Queries, N+1, memory, caching | `.agents/rules/13-performance.md` |
| Adding a `catch`, a retry, a fallback or a job | `.agents/rules/14-error-handling.md` |
| Validation, a request object, a form's server contract | `.agents/rules/15-validation.md` |
| Writing a PR / MR description | `.agents/rules/20-pull-request.md` |
| Naming a class, method, table, route, enum or component | `.agents/rules/21-naming.md` |
| An explicit release or audit | `.agents/rules/90-release-checklist.md` |
| Finishing a task: the journal entry, where the lesson belongs, the evidence gate | `.agents/rules/03-iteration.md` |

## Stack rules — activated by the files you touch

| Files | Read |
| :--- | :--- |
| `**/*.php`, `composer.json` | `.agents/rules/php-laravel.md` |
| `resources/js/**`, `**/*.vue`, `**/*.ts` | `.agents/rules/vue-inertia-ts.md` |
| `**/*.py`, `pyproject.toml` | `.agents/rules/python.md` |
| `**/*.java`, `pom.xml`, `build.gradle*` | `.agents/rules/java.md` |
| `**/*.c`, `**/*.cpp`, `**/*.h`, `CMakeLists.txt` | `.agents/rules/c-cpp.md` |
| `**/*.ipynb` — notebooks, AI/ML experiments | `.agents/rules/jupyter.md` |

Antigravity activates those automatically from the frontmatter `globs`. Harnesses without a
frontmatter mechanism use this table instead — one set of files, two consumers.

## Adding rules

- A rule must be **true for the codebase it applies to** and, where possible, **checkable** by a
  command. A rule that is false is worse than no rule: it either causes the wrong work or teaches
  the agent to distrust the rest of the set.
- If a rule describes one project's stack (its test runner, permission layer, tenancy model), it
  belongs in **that project's overlay**, not here.
- Keep this entry point an **index** — paths plus one line each — so an agent pulls two or three
  files rather than loading all of them.

## Consuming and migrating

`init` for a project with no rules, `sync` for routine updates, `migrate` for one that already has
rules of its own, and `local` for one whose rules must not be pushed. See `README.md` for the
commands and their guarantees.

`local` exists for the repository that already carries another tool's rule corpus — Laravel Boost's
`<laravel-boost-guidelines>` block and `.ai/` tree, a cloud agent's `CLAUDE.md`. It writes only into
paths git does not track, hides them through a delimited block in `.git/info/exclude` (local to one
clone, never committed), and **refuses** when a path it must hide is already tracked, because an
ignore rule does nothing to a tracked file. The cost is stated rather than hidden: a fresh clone, a
teammate and a CI runner get none of these rules.

Files another tool owns are reported and never written — not even to add a routing row. `local`
prints the row for you to add yourself, outside any marker block.

## Closing the loop

Work done under this base is supposed to change it. `.agents/rules/03-iteration.md` defines the path
from a finished task to a rule: one journal entry in the consuming project, a destination, an
evidence gate, and a promotion step that is stamped so a pending lesson is visible instead of
assumed done. The base keeps its own journal in `.agents/journal/` — the lessons that produced the
guards in `bin/`, with the failure each one came from.

A migration is not finished when the guards go green. The old corpus's project-specific facts —
versions, runner, the subsystems it names — must be folded into that project's `project-truth.md`
and `project-conventions.md` **before** the old files are retired, and its skills must be routed
from its `AGENTS.md`: this base vendors rules, never skills. A rule that is deleted without being
read is a rule that is lost.

See `README.md` for the layer model, the activation modes, and the consumption mechanisms.
