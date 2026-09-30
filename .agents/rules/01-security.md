---
trigger: always_on
description: "Portable security invariants: trust boundaries, authorization, injection, secrets, uploads."
---

# Security Invariants

Portable. A project overlay adds its own tenancy, storage or compliance rules; none of them
should relax these.

- **Validate untrusted input at the boundary, on the server**, regardless of any client-side
  validation. Client checks are UX, never the security boundary.
- **Authorize at the action/resource boundary** — a policy, guard or explicit check on the
  specific resource. Never infer access from a parent scope being reachable, and never perform
  authorization inside a model, job or serializer.
- **Check capability and scope as two separate gates.** First: may this actor perform this action
  at all? Then: may they perform it on *this* record? Capability governs **what** an actor can do;
  scope governs **where** and **on whose data**. Never answer the second question from the answer
  to the first, and never answer the first from which record happens to be in hand.
- **Inspect the mechanism, not the label.** Decide access through the project's permission or
  scope check — never from a role name, a role helper (`isAdmin()`), or a hidden UI affordance. A
  label can be renamed; the check is the contract.
- **If the codebase has a tenant, branch, team or hierarchy scope, every query on a scoped model
  applies it** — including eager-loaded relations and aggregate queries — and no response may mix
  scopes. A query whose scope you cannot state is an unscoped query.
- **Parameterize every query.** Never interpolate untrusted input into SQL, into a shell command,
  or into a template that evaluates it.
- **Never expose secrets or unnecessary personal data** through logs, error messages, URLs,
  analytics or client-visible state. Redact credentials in any output you produce.
- **Validate uploads server-side** by type, size and content before storing or processing them.
  Never trust a client-reported MIME type.
- **Fail closed.** If an authorization or validation decision cannot be made, deny.
- **Treat a secret in a diff as a stop-the-line event** — including an accidentally committed env
  file. Report it rather than quietly removing it.
