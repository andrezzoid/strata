# `shallowModule` — Interface heavy relative to implementation

## What

A module whose exported surface is large relative to its body lines — it exposes much and implements little.

```typescript
// Flagged: 4 surface elements, only 6 body lines
export interface Logger { log(msg: string): void; }
export interface Config { level: string; }
export const DEFAULT_LEVEL = "info";
export function createLogger(config: Config): Logger {
  return { log: (msg) => console.log(`[${config.level}] ${msg}`) };
}
```

```typescript
// Consider: hide Config as an implementation detail, expose only what callers need
export interface Logger { log(msg: string): void; }
export const DEFAULT_LEVEL = "info";
export function createLogger(level = DEFAULT_LEVEL): Logger {
  return { log: (msg) => console.log(`[${level}] ${msg}`) };
}
// Fewer exports, same capability — callers no longer need to know about Config
```

## Why

David Parnas defined a module by what it *hides* — the design decisions callers should not need to know. A shallow module hides little: it exposes concepts almost as fast as it introduces them, which means callers absorb most of the complexity themselves.

John Ousterhout formalised this as the central design metric in *A Philosophy of Software Design* (Ch. 4): good modules are *deep* — small interfaces hiding substantial implementations. Shallow modules add layers of naming without adding layers of abstraction. They exist in the call stack but not in the cognitive stack.

## How

Compares how much a file exposes against how much it implements. The exported surface counts top-level exports; for classes declared directly inline in a named export statement, public members are each counted individually. Classes exported by reference or as a default export count as a single element. The implementation body counts non-blank, non-comment, non-import lines. When the surface exceeds 30% of the body, with at least 2 surface elements and 3 body lines, the module is considered shallow. The minimums prevent trivially small files from producing misleading ratios.

## When a finding may be acceptable

- **Pure type files**: a file that exports only TypeScript type declarations has a high surface/body ratio by design. Types are the product, not incidental to it.
- **Intentionally thin adapters**: a legitimate adapter over a third-party dependency may have little logic by design. The question to ask is whether the adapter hides a meaningful decision — if it does, the shallow ratio is earned.

---

**See also:** [`wideModule`](wide-module.md) — measures the same surface from a different angle: too many exports rather than too few implementation lines.
