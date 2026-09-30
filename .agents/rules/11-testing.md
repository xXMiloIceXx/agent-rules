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

## Focus areas beyond the happy path

A change touching any of these needs its own case: authorization bypass, transaction safety,
races under concurrent writes, duplicate requests and idempotency, and the consistency of any
derived, cached or aggregated value.

## Discover the test environment; never assume it

The test runner and the database are properties of the project, not conventions you bring with
you. Read the test configuration before writing or running a test, and follow what it says.

- **Runner.** Whichever one the project has installed — Pest or PHPUnit, `pytest` or `unittest`,
  one framework or another. Do not introduce the other one, and do not port existing tests to your
  preference.
- **Database.** If the project configures a real engine for tests (for example MySQL with a
  dedicated test schema), use **that**: migrations, column types, constraints and dialect
  behaviour only actually get exercised against a real engine. If it configures in-memory SQLite,
  use that. **Never assume `:memory:` because it is a common default — and never switch a
  project's test database to make a failing test pass.**
- **Infrastructure.** Cache, queue, storage and external services are usually faked. Match how the
  existing tests do it rather than inventing a new approach.

Changing the test environment is a project decision, not a testing convenience: raise it instead
of doing it quietly.

## The test environment is not production

The test database, cache, queue and storage are usually fakes with different behaviour. Do not run
engine-specific statements, and do not rely on a particular SQL mode or collation, without
checking the driver. Mock the external services the production path would call. A suite that only
passes against real infrastructure will not run in CI.

## Trust

- A test that cannot fail is not a test. Assert on behaviour, not on implementation detail.
- Prefer one clear assertion of the contract over many incidental ones.
- Measure timing or performance only when the task is about performance, and report real numbers.
- Run the suite before claiming success — a green run you did not execute is not evidence.
