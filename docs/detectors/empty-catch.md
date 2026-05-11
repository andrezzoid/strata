# `emptyCatch` — Silently discarded error

## What

A `catch` clause with no executable statements — the error is caught and ignored.

```typescript
// Flagged
try {
  await fetchData();
} catch {
  // nothing
}
```

## Why

An empty catch makes failures invisible. The operation failed; the catch clause knows it; nothing else does. Callers receive no signal, observability systems receive no event, and the program continues in a state the author did not anticipate and did not handle.

This is distinct from *expected* failures handled by design — a file that might not exist, a parse that might fail on bad input. Those require a decision about what to do when the operation fails. An empty catch is not a decision; it is the absence of one. The author has acknowledged an error path and chosen to neither handle it, log it, nor propagate it.

The result is a category of bugs that are hard to diagnose: the operation silently fails, the program continues in a degraded state, and no information is available to explain why.

## How

Flags `catch` blocks that contain no executable statements. A comment inside the catch body does not satisfy the check — a comment is not handling.

## When a finding may be acceptable

- **Best-effort operations**: cleanup, telemetry, or cache-warming operations where failure should genuinely not affect the main control flow. Even here, an inline comment explaining the intent is more honest than silence, and a `console.warn` or structured log call costs almost nothing.
- **Expected no-ops**: some APIs use exceptions for control flow in ways that are irrelevant to the caller. These should be documented with an inline comment so the intent is legible to the next reader.

---

**See also:** [`catchRethrow`](catch-rethrow.md) — a related catch-handling failure where the error is acknowledged but not handled.
