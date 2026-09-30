---
trigger: model_decision
description: "Failure strategy: isolate non-critical failures, degrade explicitly, never swallow silently, fail fast or fail safe deliberately."
---

# Error Handling

Read when adding a `try`/`catch`, a retry, a fallback, a background job, or anything that can
fail while the main workflow must survive.

## The three rules

1. **Non-critical failures must not break the primary workflow.** An auxiliary failure —
   a notification, a log sink, an analytics call, a thumbnail — is isolated from the operation
   the user actually asked for.
2. **A recoverable failure needs an explicit strategy.** Choose one and name it: fallback value,
   bounded retry with backoff, graceful degradation, or a user-visible recovery path. "It
   probably won't happen" is not a strategy.
3. **Never swallow silently.** If a failure is suppressed, log it with enough context to
   diagnose — what was attempted, with which inputs, and what was substituted. A bare
   `catch {}`, `except: pass`, or `rescue nil` is a defect, not error handling.

## Fail fast or fail safe — deliberately

- **Unrecoverable state: fail fast.** A violated invariant should stop the operation loudly and
  leave no partial effect. Silent continuation on corrupt state is worse than an error.
- **Recoverable state: fail safely.** Deny, degrade or queue rather than proceeding into an
  unknown state.

## Boundaries

- Catch the **specific** error you can handle. A catch-all hides the bug you are about to write.
- Never let a caught error leave a transaction, lock, file handle or stream open — release it on
  every path, including the failure path.
- Do not convert an internal error into a success response. If the caller cannot distinguish
  success from failure, the API is lying.
- Errors surfaced to a user must be actionable and must not leak internals: no stack traces,
  query fragments, file paths or credentials in a response.
