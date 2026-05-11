# `tsEscapeHatch` — Type system bypass

## What

An `as any` cast, `@ts-ignore`, or `@ts-expect-error` comment that suppresses TypeScript's static checks.

```typescript
// Flagged: as any cast
const value = (rawData as any).nested.field;

// Flagged: suppression comment
// @ts-ignore
callWithWrongTypes(a, b);
```

## Why

TypeScript's type system is the primary mechanism for expressing and verifying interface contracts at compile time. An escape hatch punches a hole in that mechanism: the assumption the author made at that point is no longer checked by the compiler, which means it is no longer checked at all. Every subsequent refactor that touches the suppressed types can silently invalidate the assumption.

The deeper problem is propagation. Once a value crosses an `as any` boundary, it carries no type information forward. Downstream code that uses the value may require its own suppressions to handle the untyped result. The type-safe surface shrinks from multiple directions.

`@ts-expect-error` is stricter than `@ts-ignore` — it will itself error if the suppressed line stops producing an error — but both are still escape hatches. They suppress the type system's ability to signal that something changed.

## How

Scans each file for two patterns independently: `as any` casts anywhere in expression position, and `@ts-ignore` / `@ts-expect-error` suppression comments. Each occurrence is flagged separately. Fingerprints are derived from the cast expression or comment content, keeping findings stable across formatting changes.

## When a finding may be acceptable

- **Third-party library type gaps**: a library without accurate type definitions may require a cast. The correct response is a narrow cast to a specific type rather than `any`, but when the type cannot be expressed at all, `as any` may be the only option. It should be accompanied by a comment explaining why.
- **`@ts-expect-error` in test files**: tests intentionally pass wrong types to verify error behaviour. This is a legitimate use that does not indicate a design problem. Consider scoping with `--exclude tsEscapeHatch` on test paths if this creates consistent noise.
