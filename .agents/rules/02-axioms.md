---
trigger: always_on
description: "Universal engineering axioms — the bug classes that recur in every codebase. Read on every task."
---

# Engineering Axioms

Each axiom below exists because it has been violated in real code. They are portable: none of
them mentions a framework, a language, or a project.

## 1. Resilient degradation

A non-critical dependency failure **must not** break the primary workflow. Choose an explicit
strategy — fallback, default, retry, graceful skip, isolation — according to the operation, and
never swallow the failure silently.

## 2. Falsy value disambiguation

**Never rely on implicit truthiness when `null`, `0`, `false` and `""` mean different things.**
State the intended comparison explicitly. This is a recurring, expensive bug: a bound of `0`
silently dropped by `value || fallback` returns every row, and `$request->input('x') ?: default`
turns a legitimate `0` into the default.

## 3. Relational and dependency lifecycle

When you modify, detach, delete, replace or disable an upstream resource, handle **all**
dependents explicitly. Never leave orphaned records, stale state, or dangling references.

## 4. Action-aware validation

Scope validation to the action actually being performed. Creation, approval, rejection,
cancellation and termination must not inherit validation requirements from unrelated actions —
a destructive action must not be blocked by a creation-time field requirement.

## 5. Cross-mode consistency

Create, edit and show views of the same entity keep a consistent field order and semantic
grouping. Do not force identical interaction components where the mode's semantics differ: a
read-only view is not a form.

## 6. Boundary cleansing and event isolation

Normalise and validate input at the boundary, according to the field's declared contract.
**Never silently alter valid user data for convenience.** Isolate nested interactions and
external navigation contexts so they cannot leak side effects upward.

## 7. Minimal change and behavioural preservation

Before editing, inspect the callers, dependencies, tests and current behaviour. Keep the change
inside the requested scope, and never perform unsolicited refactoring, rename unrelated symbols,
or alter an existing API, data or behavioural contract without an explicit requirement. When
behaviour is ambiguous, infer it from the code, the callers, the tests and the domain rules
before introducing new behaviour.
