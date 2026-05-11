# `catchRethrow` — Catch that only rethrows

## What

A `catch` clause whose only statement rethrows the caught error unchanged.

```typescript
// Flagged: the try/catch is equivalent to no try/catch at all
try {
  await riskyOperation();
} catch (err) {
  throw err;
}
```

## Why

A catch-rethrow is the error-handling equivalent of `passThroughMethod`: it intercepts the error, contributes nothing, and passes it on. The `try/catch` structure signals to readers that something is handled here — but nothing is. This is a form of deceptive complexity: the code implies intent that does not exist.

If the goal is to let errors propagate, the correct design is to remove the `try/catch` entirely. If the goal is to add context, log, clean up, or wrap the error in a domain type, the catch body should do that. A pure rethrow is a third option that achieves neither.

Catches that rethrow a _different_ error — wrapping or enriching the original — are not flagged. Those have intent.

## How

Flags `catch` blocks containing exactly one statement: a `throw` of the same error that was caught. Catches that throw a different value, a wrapped error, or a new expression are excluded — those have intent.

## When a finding may be acceptable

- **TypeScript control-flow narrowing**: occasionally a rethrow satisfies TypeScript's control-flow analysis in a way that restructuring the code would not. If removing the catch would produce a type error, consider whether the typing can be improved upstream before accepting the rethrow.
- **Temporary stubs**: if the catch body is a placeholder that will be filled in, track it explicitly — either via a suppression with a rationale or a linked ticket in a comment — rather than leaving a silent rethrow.

---

**See also:** [`emptyCatch`](empty-catch.md) — a related catch-handling failure where the error is silently discarded rather than pointlessly re-raised.
