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
`.agents/bin/`, and records a sha256 per file plus the index's location in
`.agents/rules.lock.json`. Nothing is fetched at build time and nothing is installed, so a fresh
clone, a CI runner and an offline laptop all see the same rules — and `check` proves the project's
copy still matches its lock.

| Situation | Command — run from **this** repository |
| :--- | :--- |
| A project with no agent rules at all | `node bin/rules-sync.mjs init --into <projectDir>` |
| A project that already has rules of its own | `node bin/rules-sync.mjs migrate --into <projectDir> …` |
| Routine update after this base changed | `node bin/rules-sync.mjs sync --into <projectDir>` |
| A project whose rules must not be pushed | `node bin/rules-sync.mjs local --into <projectDir>` |
| Anywhere, with no copy of this repository | `node .agents/bin/rules-sync.mjs check` |

Add `--dry-run` to any of the first four to see the plan without writing.

`.agents/rules.json` stays empty. It is Antigravity's inheritance manifest, and this base does not
use that mechanism: an `inherits` path is a local convention that a fresh CI checkout does not
have — which is exactly the failure mode that vendoring removes. The rule files themselves still
carry the frontmatter Antigravity needs, so one set of files serves both consumers.

## Keeping the rules out of the repository — `local`

Sometimes the rules must work for you **now** without being added to the repository: it already
carries another tool's rule corpus, or you do not want a 21-file diff on your next pull request.
That is `local`, and it is a mode with a checked promise rather than a flag:

```bash
node bin/rules-sync.mjs local --into "<projectDir>"            # vendor, hide, verify
node bin/rules-sync.mjs local --into "<projectDir>" --restore  # put the repository back
```

| | Behaviour |
| :--- | :--- |
| Where it writes | Only paths git does not track. Paths this base writes — `.agents/rules/`, `.agents/bin/`, `.agents/journal/`, the lock, the pointers, and the index when it is not the root one — are hidden through a delimited block in `.git/info/exclude`. |
| What it refuses | Anything already tracked. **An ignore rule does not apply to a tracked file**, so excluding one hides nothing and the rules get pushed anyway. The command names the path, prints both ways out, and writes nothing. There is no flag that bypasses this, because no flag can make the promise true. |
| Where the index goes | The root `AGENTS.md` **only if it does not exist or this base already owns it** (the lock says which). Otherwise the index is written to `.agents/AGENTS.md` and the command prints the one row for you to add yourself. |
| What it does not do | Scaffold a CI workflow. A workflow hidden from git can never run, and scaffolding one would imply a guard that does not exist. |
| The evidence | It asks git what it can still see and reports the answer, instead of asserting that the ignore worked. |
| The cost | **A fresh clone, a teammate and a CI runner get none of these rules.** That is the mode, not a bug — which is why it is not the default. |

`npx agent-rules` with no arguments runs `local` in the current directory. It used to run `init` and
then append to `.git/info/exclude` on its own, which meant the same project behaved differently
depending on which command you typed, and the promise was never checked against git. It is now an
argument mapper; there is exactly one implementation of the ignore, and `validate-rules` fails if a
second one appears.

## Coexisting with another tool's rules

A repository may already have rules written by something else — Laravel Boost, a cloud agent, a
harness you no longer use. `rules-sync` detects them on `init`, `local` and `migrate`, names the
owner, and **writes none of them**. Not even to add a routing row.

The Boost specifics below are read from `laravel/boost` source, because the difference between "we
think it preserves our file" and "it preserves the file outside its own markers" is the difference
between a rule that survives and a rule that goes quiet:

| Fact | Consequence |
| :--- | :--- |
| Boost writes 12 of its 13 harnesses to the same root `AGENTS.md`, and owns the block between `<laravel-boost-guidelines>` and `</laravel-boost-guidelines>` | The root index is usually Boost's, not ours. `local` moves the index instead of fighting for the file. |
| Only the **first** marker block is replaced, **in place**; content outside it is preserved verbatim and keeps its position | A row added outside the block survives `boost:update`. That is why the printed instruction says *outside*, and why it is worth having. |
| A file with no markers gets the block appended behind `\n\n===\n\n`; overwriting the file wholesale drops the markers and Boost re-appends, accumulating separators | This is the failure `--point-at-index --force` used to cause. It is no longer offered for a foreign file. |
| `.ai/rules/boost/**` is deleted and regenerated on every install or update; `.ai/rules/index.md` is regenerated on every rule write; `.ai/rules/*.md` may carry **only** a `paths` key, and any other frontmatter is silently dropped | None of these is a place to store a rule of ours. They are reported, never written. |
| Boost installs skills into `.agents/skills/` for Antigravity, Codex, Amp and Zed — and deletes and re-copies an installed skill directory | `.agents/skills/` is where this base routes project skills too. `local` excludes **only** the paths this base writes, never `.agents/` wholesale, and warns when both tools have skills there. A namesake would be destroyed with no warning. |

`check-index.mjs` reports such files as `THEIRS`, not `STALE`. A warning that fires on every run and
can never be resolved is a warning people learn to scroll past — and the previous version's advice
(`--point-at-index … --force`) destroyed the live guidelines the agent was reading.

## Closing the loop — self-iteration

Work done under this base is supposed to change it. A lesson travels a fixed path and stops at the
first gate it fails:

```
task → journal entry → destination → promotion → rule
```

| Step | What happens |
| :--- | :--- |
| **Record** | `node bin/rules-sync.mjs learn --into <project> --task "<slug>" --entry <file>` appends one entry to `.agents/journal/`. Trigger, change, evidence, lesson, destination, direction. |
| **The gate** | Any destination other than `journal` requires an `Evidence` field containing a backticked command or path. The tool refuses the entry without it. A lesson with no evidence can be recorded but never promoted — that is the whole difference between a base of hard-won lessons and one of plausible-sounding opinions. |
| **Route** | Project fact → `project-truth.md`; project command or trap → `project-conventions.md`; framework idiom → a stack rule; behavioural law → a numbered core rule. Unproven → the journal, where it costs nothing and misleads no one. |
| **Promote** | Edit the target file, then `journal --promote <id> --to <path>`. An entry with a destination and no `Promoted:` stamp shows up as `PENDING` on every `check-index` run until it is resolved. |
| **Look forward** | `journal --next` prints every recorded `Direction`. That list is the backlog. |

The journal is **history, not rules**: nothing routes it, both guards skip it by name, and
`--retire` will not move it. It is committed in normal mode and hidden in `local` mode, so it follows
the same publishing decision as everything else. The base keeps its own in `.agents/journal/` — the
failures that produced the guards in `bin/`, which until now were only visible as prose in this file.

`00-core.md` carries the closing protocol that fires at the end of every task;
`.agents/rules/03-iteration.md` holds the format, the destination tree and the gate.

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
3. **Resolve every other entry point.** `migrate` lists the files it found and sorts them into three
   answers. A **stale** file keeps applying its own rules beside the index:
   `--point-at-index <rel> --force` replaces it with a pointer and keeps `<rel>.bak`, or fold it
   into the overlay and delete it. A **foreign** file — one another tool owns, recognised by its
   marker — is never written by this base; adding the routing row is your call, and the row goes
   *outside* the other tool's marker block. `--require-clean` turns anything unresolved into a
   failure, useful as the last gate of a migration.
4. **Commit.** Then `node .agents/bin/check-index.mjs && node .agents/bin/rules-sync.mjs check`
   in CI, which is what the scaffolded workflow already runs.

## Adding a stack

1. Create `.agents/rules/<stack>.md` with `trigger: glob` and the file patterns that identify it.
2. Start the body with **discover first**: read the project's manifest for pinned versions and
   tools, and follow those rather than a preference.
3. Only then state idioms. Anything that is really a project fact belongs in that project's
   overlay, not here.

## Promoting a project lesson into the base

The base is meant to accumulate what real projects teach — that is where most of it came from. But
the same mechanism, used without a gate, is how a base ends up full of one project's assumptions:
rules that name a test runner the next repository does not use, or a subsystem it does not have.
**A rule that is false for the codebase it applies to is worse than no rule.**

The gate below is what `rules-sync learn` enforces mechanically and `.agents/rules/03-iteration.md`
states in full: a lesson is recorded freely in the journal, and promoted only when it survives these
questions. An entry that names a destination without evidence cannot be recorded at all.

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
    00-core.md                 # always_on — includes the closing protocol
    01-security.md             # always_on
    02-axioms.md               # always_on
    03-iteration.md            # model_decision — the journal, the destination tree, the gate
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
  journal/                     # one entry per task — history, not rules (see "Closing the loop")
bin/
  rules-sync.mjs               # sync / init / local / migrate / learn / journal / check
  check-index.mjs              # rule-reachability guard, vendored into every project
  validate-rules.mjs           # this repository's own structure check
templates/                     # what `init` and `migrate` scaffold
  AGENTS.md                    #   the index (routes rules, skills and the thin pointers)
  project-truth.md             #   project facts (overrides this base)
  project-conventions.md       #   project commands and layout
  workflow-agent-rules.yml     #   the two CI guard steps
tests/
  smoke.sh                     # every promise this tool makes, asserted — CI runs this same file
```

A consuming project ends up with this shape — every one of these is committed in `init`/`sync`/
`migrate`, and hidden in `local`:

```
AGENTS.md                                   # the index (project-owned; migrate keeps a .bak)
.agents/rules/<vendored>.md                 # 19 rules, stamped, never hand-edited
.agents/rules/project-truth.md              # project-owned overlay
.agents/rules/project-conventions.md        # project-owned overlay
.agents/rules.lock.json                     # revision + index path + sha256 per vendored file
.agents/journal/…                           # one file per month, appended, never rewritten
.agents/bin/rules-sync.mjs                  # check-only copy, needs no clone of this base
.agents/bin/check-index.mjs                 # rule-reachability guard
.agents/AGENTS.md, .agents/claude/CLAUDE.md, .agents/codex/AGENTS.md   # thin pointers
.agents/legacy/…                            # retired rules, kept as reference (migrate only)
.github/workflows/agent-rules.yml           # the two guard steps

# `local` instead writes the index to .agents/AGENTS.md when the root one is another tool's,
# and hides all of the above through a block in .git/info/exclude. No workflow, no commit.
```

## Status

Version 1, in use by more than one project. Four entry points, all re-runnable, none of which
overwrite a project-owned file, and none of which writes a file another tool owns: `init` for a
project with no rules, `migrate` for one that already has its own, `sync` for routine updates, and
`local` for one whose rules must not be pushed. `migrate` is the answer to "replace the old rules":
it adopts the index with a backup, retires the old corpus into `.agents/legacy/` instead of deleting
it, reports every other entry point by owner, and ends by running the project's own guard so a green
exit means the project's CI will be green too.

`local` is the answer to "do not add anything to my repository": it writes only into paths git does
not track, refuses outright when a path it must hide is already tracked, and verifies the ignore by
asking git rather than asserting it worked. Two commands close the loop: `learn` records one
evidence-gated journal entry per task, and `journal` shows what is still waiting to become a rule.

The base is checked on every push: rule structure, reachability, template safety, the journal's own
gate, that the local ignore has exactly one implementation, and that CI runs the tests that exist.
`tests/smoke.sh` is the same file locally and in CI — it bootstraps a scratch project, refreshes it,
migrates a legacy fixture, runs `local` against a fixture carrying a Laravel Boost corpus, and walks
the journal from entry to promotion. The workflow used to hold the assertions inline, which meant
they could only be run by pushing, and the two bugs in them were found by running them here.

The assertions are the promises: a name collision writes nothing at all, `--force` keeps the
original, a legacy corpus ends up retired with both guards passing, a foreign file comes back
byte-identical, `git status` shows nothing of ours in `local` mode, and an unproven lesson cannot be
promoted.
