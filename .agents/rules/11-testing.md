---
trigger: model_decision
description: "What a change owes in tests, which boundaries matter, and how to keep a suite trustworthy."
---

# Testing

## What a change owes

Every behavioural change ships with a test that would fail without it. If a test genuinely cannot
be written, say why rather than skipping silently.

Never delete or weaken a passing test to make a change land. If a test is truly obsolete, explain
and get agreement first.

## Boundaries that matter

Test the edges of the behaviour, not only the happy path: null, zero, an empty collection, the
maximum, the first and last row of a page.

And test the value that is **falsy but meaningful** — `0`, `"0"`, `false`, `""`. This is a
recurring real bug: a truthiness check silently swallows it. A form field reading `"0"` through
`value || undefined` will drop a legitimate zero filter and return everything.

Terminal and destructive actions (delete, cancel, reject, expire, revoke) each need a dedicated
case. So do authorization denials and duplicate-request/idempotency paths.

## Trust

- A test that cannot fail is not a test. Assert on behaviour, not on implementation detail.
- Prefer one clear assertion of the contract over many incidental ones.
- Measure timing or performance only when the task is about performance, and report real numbers.
- Run the suite before claiming success — a green run you did not execute is not evidence.
