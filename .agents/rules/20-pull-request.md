---
trigger: model_decision
description: "How to write a pull-request / merge-request description from the net diff, not from memory."
---

# Pull Request & Merge Request Descriptions

Read when asked to write or review a PR/MR description.

## Ground it in the net diff, never in memory

Solution choices pivot during review. A description written from chat history or intermediate
commits will describe code that no longer exists.

1. Identify the target branch (`origin/main`, `origin/master`, `origin/staging`).
2. Read the cumulative diff: `git diff <target>...HEAD --stat`, then the diff itself where it
   matters.
3. Describe the **net final state**:
   - omit intermediate experiments and superseded attempts;
   - state the final architectural decision and why it was chosen, especially if review caused a
     pivot;
   - make the file list match the diff exactly — no phantom files, no omissions.

## Structure

```text
Action:
[one or two sentences: the net outcome delivered to the target branch]

Description:
[Area 1 (path/to/file.ext)]:
- what changed, and which behaviour or contract it affects
[Area 2 (path/to/file.ext)]:
- ...

Tracked Reason:
Issue / Current Behaviour: [the state on the target branch before this change]
Expected Behaviour: [the state after it merges, and how this resolves the issue]
Solution Rationale / Latest Choice: [why this design, especially after a pivot]
```

Group the `Description` by layer or component — backend, frontend, routes, schema, validation —
and name the files, classes and methods involved.

## Before calling it ready

Remind the reader of the project's own pre-commit gate (its formatter, linter and test command);
those commands belong to the project, not to this rule. If the project defines a single "ready"
alias, name that instead.
