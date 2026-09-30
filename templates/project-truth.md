---
trigger: always_on
description: "{{PROJECT}}'s actual stack and infrastructure. Overrides any portable rule that contradicts it."
---

# Project Truth — {{PROJECT}}

**Precedence: this file overrides any portable rule that contradicts it.** The vendored rules in
`.agents/rules/` are portable across projects, so some of them will describe stacks this
repository does not have. Where they disagree with the facts below, these facts win.

Every claim here must be **checked against the repository**, never assumed.
`.agents/bin/check-index.mjs` keeps the rule *structure* honest; nothing keeps a *fact* honest
except re-checking it — so re-check before adding a row, and delete a row the moment it stops
being true.

## Stack

Fill this in by reading the manifests. Do not guess, and do not copy another project's answers.

| Fact | Implication for the rules |
| :--- | :--- |
| Language / runtime version, from the manifest | Which syntax the rules may assume |
| Framework and version | Which stack rule applies |
| **Test runner** — and whether the alternative is absent | Which testing rule applies; name the one that does not |
| Test database / driver | Whether a rule that assumes another engine is wrong here |
| Anything this project does **not** have | Name the portable rule it invalidates, so no agent builds it |

## What this codebase actually contains

Verified by directory listing, not by convention. An agent that knows the real shape stops
inventing parallel structures.

| Area | Contents |
| :--- | :--- |
| Models / entities | |
| Domain layer (services, actions) | |
| Entry points (controllers, handlers, commands) | |
| Policies / authorization | |
| Jobs / workers | |
| Frontend | |
| Tests, and what they already cover | |

## Provenance

The vendored rules under `.agents/rules/` were generalised across several projects. Where one of
them describes a capability this repository does not have, record it above rather than deleting
the rule — the base is shared, and another project may need exactly that rule.

## How to extend this file

Add a row whenever a portable rule is found to contradict live code. **Verify the claim against
the repository first**: a fact recorded here that is no longer true is worse than no row, because
everything after it inherits its credibility.

If a rule you added here turns out to be true of *every* project rather than just this one, it
belongs in the base, not here — see the promotion gate in the `agent-rules` README.
