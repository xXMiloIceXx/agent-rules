---
trigger: model_decision
description: "Validation architecture: the request object is authoritative, backend re-validation, action-scoped rules, and the validated-payload whitelist."
---

# Validation

Read when adding or changing validation, a request/input object, or a form's server contract.

## Authority

- The **server-side request validator is the single authoritative source of truth**. Client-side
  validation is UX only; it is never the security boundary.
- Export rules to the client for feedback if the project does so, but **re-validate on the
  server** regardless of what the client sent.
- State-, permission- and cross-field-dependent rules must be validated on the server, because
  only the server can see them.
- Input normalisation happens **before** business validation, and must follow the field's
  declared contract. Never silently rewrite a valid value to make it pass.

## Action-scoped rules

Scope rules to the action being performed. A terminal or destructive action must not be blocked
by a creation-time requirement, and an update must not silently require the whole creation
payload. Prefer per-action rule sets over one set with conditionals sprayed through it.

## The validated-payload whitelist

Where the framework offers a validated-payload accessor, it returns **only the fields declared
in the rules**. That is a security whitelist: undeclared input is dropped, so an agent cannot
accidentally read a parameter the client invented.

- Read input through the validated payload, never the raw request, for any field the rules cover.
  Raw access bypasses validation entirely even when a validator is type-hinted on the method.
- Reading raw input is acceptable **only** for fields deliberately excluded from the rules —
  and that exclusion should be obvious in the code.

## Two traps that bite every time

**Trap 1 — an optional field is absent from the validated payload.** It contains only fields
that were sent *and* declared. An optional field that was not sent simply will not be there, so
a direct index access throws. Declare it in the rules (even as `nullable`/`sometimes`) **and**
read it null-safely.

**Trap 2 — `nullable` and `sometimes` are not interchangeable.**
- `nullable` — the key is expected to be present, but its value may be null.
- `sometimes` — the rules only run when the key is present at all; if it is absent, validation is
  skipped and the field will not appear in the validated payload.

For partial (PATCH-style) updates use `sometimes` (often with `nullable`) so a field can be
omitted entirely. `nullable` alone does not let a client safely omit the key.
