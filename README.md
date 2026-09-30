# Portable Agent Rules

Language-agnostic engineering rules for coding agents, packaged for
[Antigravity](https://antigravity.google/docs/rules) and usable by any harness that reads a
root `AGENTS.md`.

The point of this repository is that **one rule base can serve every workspace** — Laravel,
Vue, Python, Java, C/C++ — without each project re-deriving it, and without copying rules from
project to project the way it was done before this existed.

## The three layers

Keep these separate. Most rule-base rot comes from mixing them.

| Layer | Lives here? | Contents | Changes when |
| :--- | :--- | :--- | :--- |
| **Core** | yes | Behavioural law: priority order, the execution protocol, evidence discipline, minimal change, security invariants, change discipline, testing, review. True in every language. | rarely |
| **Stack** | yes | `php-laravel`, `vue-inertia-ts`, `python`, `java`, `c-cpp`. Activated by file glob. | when a stack's idioms evolve |
| **Project** | **no** | A project's verified facts: its versions, its runner, what it does *not* have. | whenever the project changes |

A project overlay always wins over this repository. That is the whole safety mechanism: this
base can stay general, while each project records its own truth.

## How the rules activate

Each rule file carries YAML frontmatter that Antigravity understands:

```yaml
---
trigger: always_on | model_decision | glob | manual
description: "..."            # shown up-front for model_decision; recommended everywhere
globs: "**/*.py, pyproject.toml"   # required for glob
---
```

- `always_on` — full text in the prompt every turn. Keep this set small; Antigravity budgets it.
- `model_decision` — only the path and `description` are injected; the agent reads the body when
  the task matches. This is how a large rule base stays cheap.
- `glob` — activates from the **files being touched**, so a C++ task pulls C++ rules without the
  agent having to classify the task.
- `manual` — only when explicitly requested.

Rules must be **flat** inside `.agents/rules/`. Antigravity ignores nested directories unless
they are registered in `.agents/rules.json`.

Harnesses without a frontmatter mechanism (for example DSH) get the same effect through a root
`AGENTS.md` that lists the same `path — when to read` mapping. One set of files, two consumers.

## Consuming this repository

The mechanism is **vendored files, committed into the project**. `rules-sync` writes
`.agents/rules/*.md` into the project with a `GENERATED` stamp, writes the two guard scripts into
`.agents/bin/`, and records a sha256 per file in `.agents/rules.lock.json`. Nothing is fetched at
build time and nothing is installed, so a fresh clone, a CI runner and an offline laptop all see
the same rules — and `check` proves the project's copy still matches its lock.

| Situation | Command — run from **this** repository |
| :--- | :--- |
| A project with no agent rules at all | `node bin/rules-sync.mjs init --into <projectDir>` |
| A project that already has rules of its own | `node bin/rules-sync.mjs migrate --into <projectDir> …` |
| Routine update after this base changed | `node bin/rules-sync.mjs sync --into <projectDir>` |
| Anywhere, with no copy of this repository | `node .agents/bin/rules-sync.mjs check` |

Add `--dry-run` to any of the first three to see the plan without writing.

`.agents/rules.json` stays empty. It is Antigravity's inheritance manifest, and this base does not
use that mechanism: an `inherits` path is a local convention that a fresh CI checkout does not
have — which is exactly the failure mode that vendoring removes. The rule files themselves still
carry the frontmatter Antigravity needs, so one set of files serves both consumers.

## Adopting an existing project — replacing its old rules

A repository that already has agent rules needs a **migration**, not a sync: `sync` vendors the
rules but will not touch a project-owned index, and it fails rather than reporting success when
that index routes nothing it just wrote. `migrate` is the command that finishes the job.

```bash
# 0. See the whole plan first. Writes nothing.
node bin/rules-sync.mjs migrate --into "<projectDir>" --replace-index --retire --dry-run

# 1. Vendor the base, adopt the index, retire the old corpus.
node bin/rules-sync.mjs migrate --into "<projectDir>" --replace-index --retire
```

What that one command does, and does not do:

| Step | Behaviour |
| :--- | :--- |
| Vendor the rules | Writes `.agents/rules/*.md`, `.agents/bin/*`, `.agents/rules.lock.json`. Never touches `project-truth.md`, `project-conventions.md` or any file it did not write. |
| Adopt the index | `AGENTS.md` is created if the project has none. `--replace-index` overwrites one that exists, after copying it to `AGENTS.md.pre-migrate.bak` — the original is never lost. Without it, an existing index is kept and reported. |
| Scaffold what the index routes | Adds the two overlay files and the CI guard workflow if they are missing. Existing files are left alone. |
| Point other harnesses at the index | Creates `.agents/AGENTS.md`, `.agents/claude/CLAUDE.md` and `.agents/codex/AGENTS.md` pointers when they are absent. A monolith (`CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `.github/copilot-instructions.md`) is **reported, not edited** — see below. |
| Retire the old corpus | `--retire` moves rule files the base did not write (`.agents/shared/*.md`, a hand-written `.agents/rules/*.md`) into `.agents/legacy/`, where `check-index` ignores them. **Moved, never deleted** — they stay in the repository as reference. |
| Finish with evidence | Runs the project's own `.agents/bin/check-index.mjs`. A non-zero exit means the index does not route the rules yet; the command says so instead of reporting success. |

Guarantees, because each of these was a bug once:

- **A name collision aborts before anything is written.** A hand-written `.agents/rules/00-core.md`
  is not the base's to overwrite: nothing is written — no lock, no half-vendored tree, no lock that
  claims a subset is complete. `--force` replaces it, keeping the original as `<file>.bak`.
- **The first backup wins.** Re-running with `--force` cannot bury the hand-written original under
  the base's own previous copy.
- **Nothing is deleted.** The old index becomes a `.bak`, the old corpus moves to `.agents/legacy/`.

Then finish by hand, in the project — the tool cannot judge these:

1. **Fold before you retire.** Facts and playbooks that only that project needs — its versions, its
   runner, its subsystems — belong in `project-truth.md` and `project-conventions.md`. Read the old
   corpus and move what is still true *before* `--retire`; a rule you delete is a rule you lose.
2. **Route the project's skills.** This base vendors rules, never skills. A skill nothing names is
   as invisible as a rule nothing routes to — add a row per skill to `AGENTS.md`.
3. **Resolve every other entry point.** `migrate` lists the files it found and whether each one
   mentions the index. A stale one keeps applying its own rules beside the index:
   `--point-at-index <rel> --force` replaces it with a pointer and keeps `<rel>.bak`, or fold it
   into the overlay and delete it. `--require-clean` turns anything unresolved into a failure —
   useful as the last gate of a migration.
4. **Commit.** Then `node .agents/bin/check-index.mjs && node .agents/bin/rules-sync.mjs check`
   in CI, which is what the scaffolded workflow already runs.

## Adding a stack

1. Create `.agents/rules/<stack>.md` with `trigger: glob` and the file patterns that identify it.
2. Start the body with **discover first**: read the project's manifest for pinned versions and
   tools, and follow those rather than a preference.
3. Only then state idioms. Anything that is really a project fact belongs in that project's
   overlay, not here.

## Promoting a project lesson into the base

The base is meant to accumulate what real projects teach — that is where most of it came from.
But the same mechanism, used without a gate, is how a base ends up full of one project's
assumptions: rules that name a test runner the next repository does not use, or a subsystem it
does not have. **A rule that is false for the codebase it applies to is worse than no rule.**

So before promoting anything, ask these in order:

1. **Is it true of a second project?** If it has only ever been true of one, it is that project's
   fact, not a rule. It belongs in its `project-truth.md`.
2. **Is it framework law or house style?** Framework idiom (however the ORM names relations) or a
   defensible general practice (prove it, then optimise) may be promoted on reasoning, not
   precedent.
3. **Does it name a project's own construct?** A trait, enum, service, command or directory that
   exists in one repository makes it project truth. This is the single most common mistake: the
   rule reads as general because the construct's name sounds generic.
4. **Would following it here have prevented a real, observed failure?** Rules that came from a bug
   are the ones worth keeping. Rules invented for symmetry are not.
5. **Can it be stated without the project's vocabulary?** If it cannot, it is not portable yet.

And the reverse — what must stay in the project:

| Stays project-local | Why |
| :--- | :--- |
| Versions, runners, engine and driver choices | Facts about a build, not rules about code |
| Anything a project does *not* have | Only meaningful negatively, in that project |
| Domain vocabulary, schema, module names | Portable only by coincidence |
| Local traps discovered in that codebase | Valuable there; noise (or misleading) elsewhere |

Promoted content goes into the numbered core rules when it is behavioural law, and into a stack
rule when it is idiomatic to one language or framework. Then bump it the normal way: edit here,
push, and re-run `sync` in each project.

## Two lessons this repository encodes

**A rule that is false for the codebase is worse than no rule.** It either causes the wrong work
or teaches the agent to distrust the whole set. Before adding a rule, verify it against the code
— and if it describes another project's stack (a test runner, a permission layer, a tenancy
model that this project does not have), it belongs in that project's overlay, not in the core.

**Discoverability is the failure mode, not memory.** Rules that live only in a subdirectory are
invisible to work elsewhere in the tree: an instruction file inside a directory is scoped to that
directory. The entry point belongs at the repository root, and it should be an **index** —
paths plus one line each — so the agent pulls two or three files instead of loading all of them.

## Layout

```
AGENTS.md                      # workspace-wide entry point for consuming projects (this repo's own)
.agents/
  rules.json                   # Antigravity inheritance manifest — empty by design, see above
  rules/
    00-core.md                 # always_on
    01-security.md             # always_on
    02-axioms.md               # always_on
    10-change-discipline.md    # model_decision
    11-testing.md              # model_decision
    12-review-debugging.md     # model_decision
    13-performance.md          # model_decision
    14-error-handling.md       # model_decision
    15-validation.md           # model_decision
    20-pull-request.md         # model_decision
    21-naming.md               # model_decision
    php-laravel.md             # glob
    vue-inertia-ts.md          # glob
    python.md                  # glob
    java.md                    # glob
    c-cpp.md                   # glob
    jupyter.md                 # glob — notebooks and AI/ML experiments
    90-release-checklist.md    # manual
bin/
  rules-sync.mjs               # sync / init / migrate / check — the only thing that writes a project
  check-index.mjs              # rule-reachability guard, vendored into every project
  validate-rules.mjs           # this repository's own structure check
templates/                     # what `init` and `migrate` scaffold
  AGENTS.md                    #   the index (routes rules, skills and the thin pointers)
  project-truth.md             #   project facts (overrides this base)
  project-conventions.md       #   project commands and layout
  workflow-agent-rules.yml     #   the two CI guard steps
```

A consuming project ends up with this shape — every one of these is committed:

```
AGENTS.md                                   # the index (project-owned; migrate keeps a .bak)
.agents/rules/<vendored>.md                 # 18 rules, stamped, never hand-edited
.agents/rules/project-truth.md              # project-owned overlay
.agents/rules/project-conventions.md        # project-owned overlay
.agents/rules.lock.json                     # revision + sha256 per vendored file
.agents/bin/rules-sync.mjs                  # check-only copy, needs no clone of this base
.agents/bin/check-index.mjs                 # rule-reachability guard
.agents/AGENTS.md, .agents/claude/CLAUDE.md, .agents/codex/AGENTS.md   # thin pointers
.agents/legacy/…                            # retired rules, kept as reference (migrate only)
.github/workflows/agent-rules.yml           # the two guard steps
```

## Status

Version 1, in use by more than one project. Three entry points, all re-runnable, none of which
overwrite a project-owned file: `init` for a project with no rules, `migrate` for one that already
has its own, `sync` for routine updates. `migrate` is the answer to "replace the old rules": it
adopts the index with a backup, retires the old corpus into `.agents/legacy/` instead of deleting
it, reports every other entry point, and ends by running the project's own guard so a green exit
means the project's CI will be green too.

The base is checked on every push: rule structure, reachability and template safety, plus smoke
tests that bootstrap a scratch project, refresh it, and migrate a legacy fixture — asserting that a
name collision writes nothing at all, that `--force` keeps the original, and that a legacy corpus
ends up retired with both guards passing.
