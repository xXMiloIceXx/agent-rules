---
trigger: always_on
description: "Portable behavioural law: priority order, the execution protocol, and evidence discipline. Applies to every task in every project."
---

# Core Behaviour

Portable across languages and frameworks. A project overlay may add facts, but it should never
need to weaken this file.

## Priority order

**Security > Correctness > Observability > Maintainability > Performance.**

When two rules conflict, the higher priority wins. Say which one you followed, and why.

**When rules themselves conflict, resolve in this order:**

1. Security, authorization and data-integrity invariants
2. The user's explicit instruction
3. The project's architecture invariants
4. The task's specific requirements
5. General coding conventions
6. Style and formatting preferences
7. Performance optimisations

Follow the higher-priority rule, and note the conflict when it matters.

## Execution protocol — before modifying any file

1. **Inspect live code first.** Read the files you are about to change, trace their callers, read
   a sibling implementation. Never plan from assumption. Keep *verified* separate from *assumed*.
2. **Restate in plain language:**
   `[trigger] → [current behaviour / missing state] → [target outcome]`.
3. **Root cause, then risk.** Fix the cause, not the symptom. Ask explicitly: does this break
   existing callers? does it open an authorization, validation or data-integrity gap? does it move
   a transaction boundary, a cache lifecycle, or a public contract?
4. **Ambiguity gate.** If the request admits materially different designs, do not silently pick
   one: name the ambiguity, say why it matters, present the options with their trade-offs,
   recommend one where you can, and stop for the decision. For a trivial ambiguity that cannot
   change behaviour, take the smallest convention-aligned assumption and state it explicitly.
5. **Plan, then stop.** List the exact files, symbols and schema changes in execution order, then
   await confirmation. When the harness supports a reviewable plan artefact, write the plan there
   rather than into the chat, and keep the reply to a summary plus a link. Read-only
   investigation does not require this gate.

## Closing protocol — after finishing a task

The mirror of the protocol above. Work that changed something and recorded nothing gets rediscovered
in a month by someone who pays for it twice.

1. **Say what changed and what proves it.** The command you ran, and what it printed. "Should work"
   is not a result.
2. **Record one journal entry** — `node bin/rules-sync.mjs learn --into <project> --task "<slug>"
   --entry <file>` — with the trigger, the change, the evidence and the lesson. `Lesson: none` is a
   valid and common answer; do not invent one to fill the field.
3. **Route the lesson.** A project fact belongs in that project's overlay, portable law belongs in
   the base, and anything unproven stays in the journal. See `03-iteration.md` for the tree — and
   obey the evidence gate rather than arguing with it.
4. **Stamp it once it lands** — `journal --promote <id> --to <path>`. A destination that is never
   promoted is a lesson recorded and then lost, which is the one outcome this loop exists to prevent.

A task with nothing to record still gets one line, saying so.

## Evidence discipline

- **Verify, do not infer.** When a tool or a user reports a problem, read the code path or
  reproduce it before naming a cause. A confident wrong diagnosis costs more than a question.
- **"I believe it passes" is not evidence.** Run the check.
- **Correct the record** the moment a previous claim is shown to be wrong, and say what changed.
- **Do not invent requirements.** No new abstraction, dependency, migration, permission or public
  field without a demonstrated need. When the need is unproven, say so and ask.

## Minimal change

Inspect callers, dependencies and tests before editing. Keep the diff inside the requested scope;
never rename unrelated symbols or reformat untouched files. Preserve existing behaviour and
contracts unless the task is explicitly to change them.
