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

Pick one mechanism. They trade reproducibility against setup cost.

| Mechanism | How | Trade-off |
| :--- | :--- | :--- |
| **Sibling clone** | Clone beside each workspace; the project's `.agents/rules.json` inherits `../agent-rules/.agents/rules.json` | Simplest; depends on a local convention that a fresh CI checkout will not have |
| **Submodule** | Add as a git submodule at a fixed path; inherit that path | Reproducible everywhere, including CI; submodules need discipline |
| **Vendored clone** | A setup script clones this repo into a gitignored path, pinned to a commit | Reproducible and CI-friendly; needs a script, like the archify pattern |
| **Global plugin** | Package as an Antigravity plugin so all workspaces get it | Best for "every workspace"; requires plugin packaging |

Whichever you choose, the project side is the same shape:

```json
{
  "inherits": [{ "path": "<path-to-this-repo>/.agents/rules.json" }],
  "entries": []
}
```

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
  rules.json                   # inheritance manifest
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
  rules-sync.mjs               # sync / init / check — the only thing that writes a project
  check-index.mjs              # rule-reachability guard, vendored into every project
  validate-rules.mjs           # this repository's own structure check
templates/                     # what `init` scaffolds into a project that has none
  AGENTS.md                    #   the index
  project-truth.md             #   project facts (overrides this base)
  project-conventions.md       #   project commands and layout
  workflow-agent-rules.yml     #   the two CI guard steps
```

## Status

Version 0, in use. A consuming project gets its rules by running `sync`, and a brand-new one is
bootstrapped with `init`: rules, the index that makes them reachable, the two overlay files, and a
guard workflow. Both are re-runnable and never overwrite a project-owned file.

The base is checked on every push: rule structure and reachability, plus a smoke test that
bootstraps a scratch project and verifies both guards pass there.
