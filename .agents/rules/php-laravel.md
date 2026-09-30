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

## Commands to look for

```bash
php artisan test               # or: vendor/bin/pest
php artisan test --filter=X    # narrow a failing case
vendor/bin/pint --dirty        # style, on finalization only
php artisan route:list         # inspect routes before claiming one exists
```
