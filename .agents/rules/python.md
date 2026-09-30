---
trigger: glob
globs: "**/*.py, pyproject.toml, requirements*.txt, setup.py, setup.cfg"
description: "Python conventions. Discover the project's pinned interpreter and tools first."
---

# Python

## Discover first

Read `pyproject.toml` or `requirements*.txt` for the interpreter, formatter and test runner.
**Follow what the project already pins** rather than introducing a new tool. Find the existing
layout (`src/` package versus flat module) and mirror it — do not restructure as a side effect of
an unrelated change.

## Conventions

- Type-annotate public functions and methods. Use `from __future__ import annotations` only if
  the project already does.
- `pathlib.Path` over string path arithmetic; f-strings over `%` or `.format`.
- Catch specific exceptions. Never a bare `except:` or `except Exception: pass` — if a failure is
  genuinely non-critical, degrade explicitly and log it.
- No mutable default arguments; use `None` plus an explicit assignment inside the body.
- Compare to `None` with `is` / `is not`.
- Normalise and validate untrusted input at the boundary, before it reaches domain logic.
- Money and other exact quantities: `decimal.Decimal`, never `float`.
- Prefer context managers for anything holding a resource.

## Commands — discover, then follow

```bash
python -m pytest -q                        # or: python -m unittest
ruff check . && ruff format --check .      # or: black --check . / flake8
mypy .                                     # only if the project type-checks
```

Run only the tools the project already depends on. If none are configured, say so rather than
adding a dependency as a side effect of an unrelated task.
