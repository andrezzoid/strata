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

## Why

David Parnas defined a module by what it *hides* — the design decisions callers should not need to know. A shallow module hides little: it exposes concepts almost as fast as it introduces them, which means callers absorb most of the complexity themselves.

John Ousterhout formalised this as the central design metric in *A Philosophy of Software Design* (Ch. 4): good modules are *deep* — small interfaces hiding substantial implementations. Shallow modules add layers of naming without adding layers of abstraction. They exist in the call stack but not in the cognitive stack.

## How

The detector counts two quantities per file:

- **Surface elements**: top-level exports plus public class members. These are the concepts a caller must understand to use the module.
- **Body lines**: non-blank, non-comment, non-import lines. These represent the implementation work the module performs on behalf of callers.

A finding fires when `surface / body > 0.3`, with a minimum of 2 surface elements and 3 body lines. The minimums prevent trivially small files from producing misleading ratios.

The finding is anchored at line 1 and includes `surface` and `bodyLines` in its metadata.

## When a finding may be acceptable

- **Pure type files**: a file that exports only TypeScript type declarations has a high surface/body ratio by design. Types are the product, not incidental to it.
- **Intentionally thin adapters**: a legitimate adapter over a third-party dependency may have little logic by design. The question to ask is whether the adapter hides a meaningful decision — if it does, the shallow ratio is earned.
