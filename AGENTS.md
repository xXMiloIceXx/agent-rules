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
| `.agents/rules/00-core.md` | Priority order, the execution protocol, evidence discipline, minimal change |
| `.agents/rules/01-security.md` | Trust boundaries, authorization, injection, secrets, uploads |

## On-demand rules — loaded when the task matches

| When | Read |
| :--- | :--- |
| Shaping or landing a change (diff size, commits, formatting) | `.agents/rules/10-change-discipline.md` |
| Writing or changing tests | `.agents/rules/11-testing.md` |
| Reviewing, debugging or refactoring | `.agents/rules/12-review-debugging.md` |
| An explicit release or audit | `.agents/rules/90-release-checklist.md` |

## Stack rules — activated by the files you touch

| Files | Read |
| :--- | :--- |
| `**/*.php`, `composer.json` | `.agents/rules/php-laravel.md` |
| `resources/js/**`, `**/*.vue`, `**/*.ts` | `.agents/rules/vue-inertia-ts.md` |
| `**/*.py`, `pyproject.toml` | `.agents/rules/python.md` |
| `**/*.java`, `pom.xml`, `build.gradle*` | `.agents/rules/java.md` |
| `**/*.c`, `**/*.cpp`, `**/*.h`, `CMakeLists.txt` | `.agents/rules/c-cpp.md` |

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

See `README.md` for the layer model, the activation modes, and the consumption mechanisms.
