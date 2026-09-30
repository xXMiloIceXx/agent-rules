---
trigger: model_decision
description: "Review, debugging and refactoring discipline: reproduce first, root cause over symptom, preserve behaviour."
---

# Review, Debugging & Refactoring

## Debugging

- **Reproduce before you fix.** If you cannot reproduce it, say so — a fix without a reproduction
  is a guess wearing a fix's clothes.
- Read the actual code path, including library code, before naming a cause. Instrument and measure
  rather than reasoning from a function's name.
- Fix the **root cause**. A guard placed at the symptom that leaves the cause intact is a
  regression waiting to happen; if a symptom-level mitigation must ship, label it as such.

## Review

When reviewing a diff, answer in this order:

1. Does it do what it claims — and is the claim the right thing to do?
2. What breaks? Callers, contracts, data, concurrency, authorization.
3. What is untested?
4. What is incidental noise — reformatting, renames, scope creep?

Report blockers with evidence: file, line, and the failing input or command.

### Checklist, in priority order

Security → Correctness → Performance → Architecture → Maintainability → Testing → Scope →
Failure path.

### Boundary checks worth running every time

- **Null semantics.** Never coerce null or empty to zero or a default without explicit intent.
- **Precision safety.** Watch for lossy casts on high-precision values (money, decimals) and for
  default scale limits.
- **End-to-end alignment.** Types and scale must agree across the schema, the casts, the request
  rules and the service that consumes them.
- **Boundary defence.** Division by zero, negative values, empty sets, scientific notation, and
  off-by-one on the first and last page.
- **Audit completeness.** A cross-cutting change usually has peripheral consumers: jobs, commands,
  seeders, imports, exports, other entry points. Enumerate them.
- **Filter semantics.** Does an omitted filter differ from a valid `0`/`false`/empty string? See
  `02-axioms.md` §2.

## Refactoring

- Refactoring and behaviour change are **separate commits**. Never mix them.
- Establish the safety net first: existing tests must pass before and after, with unchanged
  assertions.
- Preserve observable behaviour and public contracts. If a contract must change, that is not a
  refactor — raise it as a design decision.
