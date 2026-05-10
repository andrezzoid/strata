# `wideModule` — Too many top-level exports

## What

A module that exposes more than 10 top-level exports.

```typescript
// Flagged: 11 exports
export const A = 1;
export const B = 2;
export const C = 3;
export function doX() { ... }
export function doY() { ... }
export function doZ() { ... }
export type Config = { ... };
export type Options = { ... };
export type Result = { ... };
export class ServiceA { ... }
export class ServiceB { ... }
```

## Why

A module's exported surface is the vocabulary callers must learn to use it. Wide modules accumulate unrelated concerns that grew together for historical or convenience reasons rather than coherent design. They impose high cognitive load on every consumer: to use any part of the module, the caller must scan the entire surface to find what they need.

The deeper issue is responsibility. A module with 15 exports rarely owns one coherent piece of knowledge. More likely it has become a catch-all for things that did not have a better home. Splitting along natural seams — what does this group of exports *know* and *decide* together? — is often the right response.

## How

Counts top-level `export` statements, including named declarations, re-export specifiers, and `export *` forms. The threshold is more than 10 top-level exports.

Public class members inside an exported class are not counted here — they are measured separately by `shallowModule`. `wideModule` measures breadth at the module level, not depth within a class.

## When a finding may be acceptable

- **Deliberate barrel files**: an `index.ts` that re-exports from a package is an aggregation point by design. These should contain no implementation logic; if they do, the re-export purpose is undermined.
- **Stable toolkit modules**: a `strings.ts` with 12 independent string utilities may legitimately be wide if each function is genuinely independent and callers import only what they need. The question is whether the module has a coherent identity or is simply a miscellany.
