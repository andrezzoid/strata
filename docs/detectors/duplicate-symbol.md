# `duplicateSymbol` — Declaration rebuilt instead of reused

## What

A named declaration — function, class, interface, type alias, or constant — whose structure appears in multiple places across the project, suggesting the same design decision was implemented more than once.

```typescript
// src/orders/utils.ts
export function parseId(raw: string): number {
  return parseInt(raw, 10);
}

// src/users/helpers.ts — identical structure, different name
export function toNumber(s: string): number {
  return parseInt(s, 10);
}
```

## Why

AI coding assistants tend to redeclare rather than reuse. Given a task, they implement what is needed locally rather than searching for an existing equivalent. The result is duplicated design decisions: two places that encode the same knowledge and must be kept in sync as requirements change.

This is a DRY violation at the declaration level — not duplicated prose or magic numbers, but duplicated behavioural decisions. When the canonical version needs to change (a bug fix, a behaviour refinement, a type correction), every copy must change too. Copies are easy to miss. The risk is not that the code is redundant today, but that it will diverge tomorrow.

## How

Compares the structure of top-level declarations across files, independent of their names, type annotations, and access modifiers. Two functions with different names but the same shape — same control flow, same call structure, same parameter count — are treated as identical. Literal values in constants are abstracted away, so two constants with different string values but otherwise identical structure will match.

A finding fires when enough structurally identical declarations accumulate: at least 2 for functions and constants, at least 3 for classes, interfaces, and type aliases. The higher threshold for complex types reflects that structural similarity among them is more likely to occur by coincidence. The finding is anchored at the first occurrence and lists all copies with their locations.

## When a finding may be acceptable

- **Test fixtures**: test files often redeclare minimal structures to keep tests self-contained and independent. Common test path patterns are excluded by default.
- **Intentional parallel implementations**: two modules that implement the same contract for different contexts — a real adapter and an in-memory stub — will have similar structure by design. The question is whether both exist for a clear reason at the same abstraction level.

---

**See also:** [`uniqueImplementation`](unique-implementation.md) — a related AI-introduced pattern: speculative abstractions created without a real polymorphism need.
