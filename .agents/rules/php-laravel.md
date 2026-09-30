---
trigger: glob
globs: "**/*.php, composer.json"
description: "Laravel / PHP conventions. Discover the project's pinned versions and tools before applying anything here."
---

# Laravel / PHP

## Discover first

Read `composer.json` for the PHP constraint and framework version, and `phpunit.xml` or
`pest.xml` for the test database and runner. **Follow what the project pins** — do not assume
Pest versus PHPUnit, MySQL versus SQLite, or a PHP version. If the project contradicts a default
here, the project wins.

## Conventions

- Validate in a dedicated FormRequest, and read validated input through `$request->validated()`.
  Never use `$request->field` or `$request->input()` for an attribute you validated.
- Authorization belongs in a Policy checked at the controller or FormRequest boundary — not
  inside models, services or jobs.
- Keep controllers thin: orchestration and the HTTP boundary only. Extract cross-table flows into
  a service or single-action class, and do not create one to wrap a trivial query.
- `DB::beginTransaction()` sits immediately before the `try` block. Prepare external I/O and file
  work before entering the transaction; clean up only after a successful commit.
- Eager-load the relations you know you will touch. Never query inside a view.
- Cast dates and enums in the model's `casts()` rather than formatting at call sites.
- Prefer framework helpers (`Str`, `Arr`, `Number`) over raw string manipulation.
- Prefer explicit `$fillable` over `$guarded = []`, and keep `status`, `role` and similar
  privilege-bearing fields out of mass assignment.

## PHP house style

- Strict types where the project enables them; type-hint parameters and return values.
- Prefer readonly properties and immutable value objects for data that does not change.
- Avoid magic methods unless the framework requires them.
- **Enum cases are `UPPER_SNAKE_CASE` with lowercase backing values** (`PENDING = 'pending'`)
  unless the domain says otherwise.
- **Class member order:** traits → constants → properties → constructor → methods. Never place a
  constant between or inside methods.
- Never put heavy data manipulation inside a DDL migration. Schema change and data change are
  separate concerns with separate failure modes.

## Seeders, backfills and bulk writes

- **Suppress model events deliberately, not by accident.** A seeder, backfill or import that saves
  models in a loop fires observers once per row — notifications, webhooks, audit entries, search
  indexing — in an environment nobody is watching. Decide explicitly which side effects you want:
  keep the events, or bypass them (`Model::withoutEvents()`, a direct query-builder update) and
  say why in the commit. Leaving it to chance is how a backfill emails every customer.
- **Re-warm what the write invalidated.** When a seeder changes cached lookups, translations or
  configuration, flush the affected cache and re-warm it in the same run. A seeder that leaves a
  stale cache behind produces a bug that reads like a code bug to whoever debugs it next.
- Seeders are **re-runnable**: the same input produces the same end state, with no duplicate rows.

## Transactions

`DB::beginTransaction()` goes immediately **outside/before** the `try` block, never inside it.

The reason is concrete: if `beginTransaction()` were itself inside the `try` and failed, the
`catch` would call `rollBack()` with no active transaction and throw a secondary "no active
transaction" error that masks the real one. Prepare external I/O before the transaction,
compensate those artefacts when it fails, and run post-commit cleanup only after a successful
commit.

## Queries

- Scope queries through named scopes or explicit conditions; avoid unguarded global query
  modifications.
- **A filter must distinguish "omitted" from a valid `0`, `false` or empty string.** A loose
  truthy check on a filter parameter silently drops a legitimate value — a `0` bound returns every
  row. See `02-axioms.md` §2.

## Commands to look for

```bash
php artisan test               # or: vendor/bin/pest
php artisan test --filter=X    # narrow a failing case
vendor/bin/pint --dirty        # style, on finalization only
php artisan route:list         # inspect routes before claiming one exists
```
