# Agent Rules — {{PROJECT}}

The single always-on entry point for this workspace. A harness that injects workspace
instructions reads this file as the repository-wide entry point; Antigravity reads it as
`<root>/AGENTS.md`. It holds the **index only** — rule bodies live in the files it routes to.

**Precedence when two rules conflict:**

1. `.agents/rules/project-truth.md` and `.agents/rules/project-conventions.md` — this
   repository's own facts and commands. **Project files always win.**
2. This file.
3. `.agents/rules/*` — the portable rules vendored from the `agent-rules` repository. Skills under
   `.agents/skills/` sit at this level too, but they are **project-local**: the base vendors rules
   only, never skills. See "Vendored rules".

## Task Execution Protocol — before modifying any project file

1. **Parse the prompt, then inspect live code first.** Never plan from assumptions: search the
   relevant files, trace callers, read sibling implementations. Keep verified facts separate from
   assumptions.
2. **Restate in plain language:**
   `[trigger] → [current behaviour / missing state] → [target outcome]`.
3. **Root cause and risk check.** The real cause, not the symptom. Ask whether the change breaks
   existing callers, opens authorization or validation gaps, or moves transaction boundaries and
   cache lifecycles.
4. **Ambiguity gate.** If the request admits materially different designs, present the options
   with trade-offs and stop. Do not silently choose.
5. **Plan, then stop.** List the exact files, methods and schema changes in execution order, then
   await confirmation. Pure read-only investigation does not trigger this gate.

## Routing Table — what to read for the task at hand

| When the work touches | Read |
| :--- | :--- |
| Anything, before the first code change | `.agents/rules/project-truth.md` (facts) + `.agents/rules/project-conventions.md` (commands) |
| Behavioural law: priority, protocol, evidence, minimal change | `.agents/rules/00-core.md` |
| The recurring bug classes: falsy values, orphaned dependents, action-scoped rules | `.agents/rules/02-axioms.md` |
| Security, authorization, secrets | `.agents/rules/01-security.md` |
| Diff size, commit shape, abstractions, formatting | `.agents/rules/10-change-discipline.md` |
| Writing or changing tests | `.agents/rules/11-testing.md` |
| Reviewing, debugging or refactoring | `.agents/rules/12-review-debugging.md` |
| Queries, N+1, memory, caching | `.agents/rules/13-performance.md` |
| Adding a `catch`, a retry, a fallback or a job | `.agents/rules/14-error-handling.md` |
| Validation, a request object, a form's server contract | `.agents/rules/15-validation.md` |
| Writing a PR / MR description | `.agents/rules/20-pull-request.md` |
| Naming a class, method, table, route, enum or component | `.agents/rules/21-naming.md` |
| PHP / Laravel / database | `.agents/rules/php-laravel.md` |
| Vue / Inertia / TypeScript | `.agents/rules/vue-inertia-ts.md` |
| Python | `.agents/rules/python.md` |
| Java / JVM builds | `.agents/rules/java.md` |
| C / C++ | `.agents/rules/c-cpp.md` |
| Jupyter notebooks, AI/ML experiments | `.agents/rules/jupyter.md` |
| An explicit release or audit | `.agents/rules/90-release-checklist.md` |

Skills are named `.agents/skills/<name>/SKILL.md`.

## Skills — project-local, and routed from here

Skills live in the project, never in the base: `rules-sync` vendors rules only. A skill nothing
names is as invisible as a rule nothing routes to, so give each one a row here with the task that
should pull it in, and name it in backticks so `check-index.mjs` can verify it exists.

| When the work is | Read |
| :--- | :--- |
| <the task that should load this skill> | `.agents/skills/<name>/SKILL.md` |

Delete this section if the project has no skills. Keep the skill list short: a skill that is
loaded on every task belongs in a rule, not in a skill.

## Entry points — one index, thin pointers

`.agents/AGENTS.md`, `.agents/claude/CLAUDE.md` and `.agents/codex/AGENTS.md` are thin pointers to
this file, kept only so tools that look for an entry point where they expect one find it. **Do not
add rules there** — `check-index.mjs` reports a pointer the index does not reach.

If another harness reads a file of its own (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
`.github/copilot-instructions.md`), point that file here as well. A second rule set beside this one
is how this index stops being authoritative, and `migrate --point-at-index <rel>` from the
`agent-rules` repository writes exactly that pointer.

## Vendored rules — generated, do not hand-edit

Every `.agents/rules/*.md` except `project-truth.md` and `project-conventions.md` is **vendored**
from the `agent-rules` repository, together with `.agents/bin/rules-sync.mjs` and
`.agents/bin/check-index.mjs`. `.agents/rules.lock.json` records the source revision and a sha256
per file. This is why a fresh clone works with no submodule, package or global install.

- **Never edit a vendored file.** Edit the source in the `agent-rules` repository, commit it
  there, then run from that repository:
  `node bin/rules-sync.mjs sync --into "<this project>"`.
  The vendored copy of the script can only `check` — by design, so a project cannot silently
  diverge from the base.
- **CI enforces it:** `node .agents/bin/rules-sync.mjs check` fails the build if a vendored file is
  modified, deleted, or out of sync.
- Project-owned files beside them — `project-truth.md`, `project-conventions.md` — are never
  touched by sync.

## Rule structure is checked

`node .agents/bin/check-index.mjs` fails if any rule file under `.agents/` is not reachable from
this index, or if this index references a path that does not exist. A rule nothing routes to is a
dead rule. Run it after adding or moving a rule.

## Operating Discipline

- **Assert the branch in the same command that commits.** The working tree may be shared with the
  user's own editor, so the checked-out branch can change between turns. Printing the branch is not
  enough — abort on mismatch.
- **Never commit before the required verification has actually run.** "I believe it passes" is not
  evidence.
- **Verify, do not infer.** When a tool reports an error, read the code path or reproduce it before
  naming a cause.
- **Correct the record** when a previous claim turns out to be wrong.
- **Do not push without the user's go-ahead.**

## Formatting

Run formatting only when source actually changed **and** the work is finished. Prefer formatting
only the changed files. Never format during Q&A or when only `.md` files changed.
