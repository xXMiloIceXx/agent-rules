---
trigger: model_decision
description: "How a finished task becomes a rule: the journal entry, the destination, the evidence gate, and the promotion loop. Read at the end of any task that changed something."
---

# Iteration — turning a task into a rule

A rule base that never learns from the work done under it is a snapshot of someone's opinions. The
base only earns its keep if real failures change it — but the same mechanism, ungated, fills it with
one project's assumptions, which is worse than an empty base.

So a lesson travels a fixed path, and it stops at the first gate it fails.

```
task → journal entry → destination → promotion → rule
                        ↑                         ↓
                        └──── evidence gate ──────┘
```

## The journal is where a lesson waits

`.agents/journal/`, one file per month, one entry per task, appended and never rewritten. It is
history, not rules: nothing routes it, `check-index` skips it, and it costs no prompt budget. Read it
when you are about to repeat work someone already did, and when a lesson is ready to promote.

Write the entry with the tool, not by hand — the tool enforces the format and the gate:

```bash
node .agents/bin/rules-sync.mjs learn --task "n+1 in the report query" --entry entry.md
node .agents/bin/rules-sync.mjs journal          # what is recorded, what is pending
node .agents/bin/rules-sync.mjs journal --next   # open directions
node .agents/bin/rules-sync.mjs journal --promote <id> --to <path>
```

In a consuming project, `check`, `learn` and `journal` run directly from the vendored script
`node .agents/bin/rules-sync.mjs` (or from the base repository via `node bin/rules-sync.mjs --into <project>`).
Only `sync`, `init`, `migrate` and `local` require the base repository because they need the source rules and templates.

## The entry

```markdown
## 2026-10-02 · n+1 in the report query

- Id: `2026-10-02-n1-in-the-report-query`
- Trigger: the report page took 4s with 200 rows
- Change: `ReportController::index` eager-loads `lines.article`
- Evidence: `php artisan test --filter=ReportQueryTest` (38 queries → 3)
- Lesson: a query inside a Blade loop reads as one line and costs N
- Destination: `base:.agents/rules/13-performance.md`
- Direction: the export path has the same shape and was not checked
```

| Field | What belongs there | Test it must pass |
| :--- | :--- | :--- |
| **Trigger** | What started the task | Would a reader recognise the situation? |
| **Change** | The files or behaviour that actually changed | Is it specific enough to find again? |
| **Evidence** | The command or path whose output proves it | Could someone else run it and see the same? |
| **Lesson** | What would have prevented the wasted work | `none` is a valid answer; an invented one is not |
| **Destination** | Where it belongs if it is true | See the tree below |
| **Direction** | What this suggests checking next | Optional. This is the backlog |

## The evidence gate

`Destination: journal` needs nothing. **Any other destination requires an `Evidence` field containing
a backticked command or path**, and the tool refuses the entry without it.

This is the whole mechanism. A rule that came from an observed failure is worth keeping; a rule
invented for symmetry is not. Recording a lesson costs a minute and is allowed to be speculative —
promoting it changes what every future task does, and is not.

## Choosing the destination

Ask in this order, and stop at the first yes:

| Question | If yes |
| :--- | :--- |
| Is it a repeatable multi-step procedure or SOP for this repo (rather than an invariant)? | `.agents/skills/<name>/SKILL.md` + a routing row in `AGENTS.md` |
| Is it true of only this project? | `project-truth.md` (a fact) or `project-conventions.md` (a command, a trap) |
| Is it one language or framework's idiom? | `stack:<path>` in the base — `php-laravel.md`, `vue-inertia-ts.md`, `python.md`, `java.md`, `c-cpp.md`, `jupyter.md` |
| Is it behavioural law, true in every codebase? | `base:.agents/rules/<numbered>.md` |
| Is it about the tooling rather than the code? | `base:bin/<script>.mjs` or the README section it explains |
| Does it name a construct that exists in one repository? | That repository's overlay. **This is the most common mistake** — a trait or enum whose name sounds generic is still one project's |
| Is it unproven, or true of one project so far? | `journal`. It waits there. Nothing is lost |

A rule that is false for the codebase it applies to is worse than no rule: it causes the wrong work,
or it teaches the agent to distrust the rest of the set. When in doubt, `journal` is the correct
answer, and it is not a demotion.

## Promotion is two steps, and the second one is the one people skip

1. **Edit the destination file.** A lesson that is stamped as promoted but never written down is the
   one failure mode this whole loop exists to prevent.
2. **Stamp the entry:** `journal --promote <id> --to <path>`. It records where the lesson went.

An unstamped entry with a destination shows up as `PENDING` on every `check-index` run until it is
resolved. That is deliberate: a recorded lesson that was never promoted is a lesson that was
recorded and then lost.

Promoting into the base is a change to this repository, not to the project — edit the source here,
run `node bin/validate-rules.mjs`, and `sync` it out.

## Directions

`Direction` is what the task revealed that it did not do: the adjacent path with the same bug, the
check that would have caught it earlier, the question that is still open. One line, written while you
still remember why it occurred to you.

`journal --next` prints them. That list is the backlog, and it is the only part of this loop that
looks forward.

## When there is nothing to record

`Lesson: none` and `Destination: journal` is a complete, valid entry. A task that changed nothing and
taught nothing is worth one line so the next reader knows it was considered — and an entry whose
lesson is `none` can never be promoted, which is the point.

## Handling `/learn` and rule/skill capture requests

When the user invokes `/learn` or asks to save a rule, convention, or skill in this workspace,
**do not** use generic file-creation defaults. Route the request strictly through this base's
iteration protocol:

1. **Never edit a vendored `.agents/rules/*.md` file** (anything listed in `.agents/rules.lock.json`),
   and never create an unrouted `.agents/rules/*.md` file.
2. **Record the journal entry first** via `node .agents/bin/rules-sync.mjs learn` with a concrete,
   backticked `Evidence` field. If the lesson has no verifiable evidence yet, set `Destination: journal`
   and tell the user why it cannot be promoted yet.
3. **Apply the promotion immediately when the destination is project-local:**
   - **Project fact** → edit `.agents/rules/project-truth.md`, then run `node .agents/bin/rules-sync.mjs journal --promote <id> --to .agents/rules/project-truth.md`.
   - **Project command or local trap** → edit `.agents/rules/project-conventions.md`, then run `node .agents/bin/rules-sync.mjs journal --promote <id> --to .agents/rules/project-conventions.md`.
   - **Reusable workflow (Skill)** → create `.agents/skills/<name>/SKILL.md` (first verifying `<name>` does not collide with an installed Laravel Boost skill), add its routing row to `AGENTS.md` under `## Skills`, and stamp `node .agents/bin/rules-sync.mjs journal --promote <id> --to .agents/skills/<name>/SKILL.md`.
   - **Portable stack or core rule (`base:...` / `stack:...`)** → leave the journal entry as `PENDING` in this project (do not touch the vendored rule file) and output the exact diff or command needed for the upstream `agent-rules` repository.
4. **Verify before finishing:** always run `node .agents/bin/check-index.mjs && node .agents/bin/rules-sync.mjs check` after `/learn` completes.
