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
- **Parameterize every query.** Never interpolate untrusted input into SQL, into a shell command,
  or into a template that evaluates it.
- **Never expose secrets or unnecessary personal data** through logs, error messages, URLs,
  analytics or client-visible state. Redact credentials in any output you produce.
- **Validate uploads server-side** by type, size and content before storing or processing them.
  Never trust a client-reported MIME type.
- **Fail closed.** If an authorization or validation decision cannot be made, deny.
- **Treat a secret in a diff as a stop-the-line event** — including an accidentally committed env
  file. Report it rather than quietly removing it.
