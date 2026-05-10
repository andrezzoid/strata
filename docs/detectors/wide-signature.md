# `wideSignature` — Too many required parameters

## What

A function, method, or constructor that requires more than 4 positional parameters.

```typescript
// Flagged: 5 required parameters
function createUser(
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

Walks the AST for `FunctionDeclaration` and `MethodDefinition` nodes (including constructors). For each, counts required parameters:

- `Identifier` params that are not marked `optional`
- `TSParameterProperty` nodes (constructor injection syntax) whose inner identifier is not optional

Rest parameters, destructured parameters, and optional parameters are excluded from the count. A finding fires when the required count exceeds 4.

## When a finding may be acceptable

- **Framework-mandated signatures**: middleware functions, event handlers, and lifecycle callbacks often have fixed arities imposed by the framework that cannot be changed.
- **Internal utilities with a single call site**: a private helper called in exactly one place may have many parameters without adding cognitive burden, since the call site is its own documentation.
