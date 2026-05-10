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

Each eligible top-level declaration is reduced to a normalised AST fingerprint. Normalisation ignores:

- **Identifier names**: `parseId` and `toNumber` match because their structure is the same.
- **Type annotations and type parameters**: `string` vs `unknown` in a parameter does not affect the fingerprint.
- **Modifier flags**: `optional`, `static`, `async`, `readonly`, `abstract`, `accessibility`.
- **Literal values in constants**: matched by structure and shape, not value.

Declarations are grouped by `kind + fingerprint`. A finding fires when the same normalised structure appears:

- **2 or more times** for functions and constants
- **3 or more times** for classes, interfaces, and type aliases (higher threshold because structural similarity among complex types is more common by coincidence)

The finding is anchored to the first occurrence (alphabetically by file, then by position) and includes all occurrences in its metadata with their names, files, and lines.

## When a finding may be acceptable

- **Test fixtures**: test files often redeclare minimal structures to keep tests self-contained and independent. Common test path patterns are excluded by default.
- **Intentional parallel implementations**: two modules that implement the same contract for different contexts — a real adapter and an in-memory stub — will have similar structure by design. The question is whether both exist for a clear reason at the same abstraction level.
