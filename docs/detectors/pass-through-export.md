# `passThroughExport` - Exported wrapper without behavior

## What

An exported function whose only executable work is forwarding its own parameters, unchanged and in the same order, to another callable with the same or closely stemmed name.

```typescript
// Flagged
import { parseConfig } from "./config-parser";

export function parseConfigFile(path: string) {
  return parseConfig(path);
}
```

```typescript
// Not flagged: this is API curation, not a callable wrapper body
export { Button } from "./button";
export { Dialog } from "./dialog";
```

## Why

An exported wrapper is part of the module's public surface. If it only renames a call, every caller learns one more API name while the implementation hides no meaningful decision. The extra surface becomes another place to document, test, search, and preserve during refactors.

This is the same design pressure as `passThroughMethod`, but on module exports instead of class methods: the wrapper should earn its name by adding policy, validation, conversion, stability over an unstable dependency, or some other useful abstraction.

Plain barrel exports are excluded by default. Re-exporting selected symbols can improve import ergonomics and curate a package API without pretending that a new callable behavior exists.

## How

Looks for exported function declarations and exported const/function-expression callables that match all of these conditions:

- The callable is exported directly or through a local named export.
- The body is exactly one forwarded call, including expression-bodied arrows and `return await`.
- The forwarded arguments are the declared identifier parameters, unchanged and in the same order.
- The callee name equals or shares a leading stem with the exported function name, such as `parseConfigFile()` forwarding to `parseConfig()`.

Any function that transforms an argument, reorders arguments, adds logic, delegates to an unrelated operation name, or is not exported is excluded.

## When a finding may be acceptable

- **Stable facade over unstable internals**: the exported name may intentionally protect callers from churn in a dependency or file layout. The wrapper should be documented as that stability boundary.
- **Typed boundary over untyped code**: a thin exported function can add value if its signature narrows an unsafe dependency or preserves a public TypeScript contract.
- **Package entrypoints**: public entry modules sometimes centralize exported names for consumers. Prefer barrel exports when no callable behavior is being added.

---

**See also:** [`passThroughMethod`](pass-through-method.md) - the class-method version of this signal.
