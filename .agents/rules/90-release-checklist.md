---
trigger: manual
description: "Opt-in release and audit rubric. Load only when explicitly requested."
---

# Release & Audit Checklist

This rule is `manual`: it never activates on its own. Load it when a release or an audit is
explicitly requested.

## Before release

- [ ] Working tree clean, and the branch under review is the intended one — **assert it, do not
      assume** (a working tree is often shared with the user's editor).
- [ ] The project's full gate is green: style check, static analysis, the test suite including
      any slow/excluded group, the frontend lint and the production build.
- [ ] Every behaviour change carries a test; no previously passing test was deleted.
- [ ] New migrations reviewed for reversibility and for data loss in the down path.
- [ ] No secrets, tokens or credentials anywhere in the diff; env files untouched.
- [ ] Public route or API changes are documented.

## After release

- [ ] The deployed revision matches the intended commit.
- [ ] Background workers, queues and scheduled tasks are running.
- [ ] The error log has been checked for exception classes introduced by this release.
