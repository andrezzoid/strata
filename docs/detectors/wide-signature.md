# `wideSignature` — Too many required parameters

## What

An exported function, or a public method/constructor on an exported class, that requires more than 4 positional parameters.

```typescript
// Flagged: 5 required parameters
export function createUser(
  name: string,
  email: string,
  role: string,
  tenantId: string,
  createdBy: string,
) { ... }
```

## Why

Each required parameter is knowledge the caller must possess and supply. A wide signature transfers cognitive burden from the function to every call site: callers must know the right value for each argument, supply them in the correct order, and read the signature to understand what each position means.

Ousterhout frames this as an interface complexity problem: the interface should minimise what callers need to know, not maximise it. A 5-parameter function often signals that the function is doing more than one thing, or that a coherent options object should carry related values and make the grouping explicit.

The positional nature of parameters compounds the problem: unlike named properties in an options object, positional arguments cannot be read without consulting the signature, and reordering them is a breaking change.

## How

Counts required positional parameters on exported top-level functions and public members of exported classes. Optional parameters, rest parameters, and destructured parameters are excluded — only parameters the external caller must always supply are counted. A finding fires when the required count exceeds 4.

Internal helpers, non-exported classes, private methods, and protected methods are skipped. The detector is aimed at caller-facing API surface, not implementation details hidden inside a module.

## When a finding may be acceptable

- **Framework-mandated signatures**: middleware functions, event handlers, and lifecycle callbacks often have fixed arities imposed by the framework that cannot be changed.
- **Boundary adapters**: exported glue code at framework or protocol edges may need to mirror another API exactly. Consider documenting why the wide signature is fixed rather than reshaping it locally.
