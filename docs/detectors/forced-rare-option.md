# `forcedRareOption` - Common callers pay for rare choices

## What

An exported function or constructor whose project call sites mostly pass the same literal, placeholder, empty object, `undefined`, `null`, or default-like value for a parameter or option.

```typescript
// Flagged: every caller repeats the HTTP version and empty headers.
export function createHttpResponse(request: Request, version: string, status: number, headers: Headers, body: Body) { ... }

createHttpResponse(request, "HTTP/1.1", 200, {}, body);
```

```typescript
// Flagged at the call site: placeholders are needed to reach a later option.
openModal("Delete account", undefined, undefined, true);
```

## Why

Overexposure happens when the common case must learn about rare flexibility. Ousterhout's defaulting principle applies here: whenever possible, classes should do the right thing without being explicitly asked.

Repeated literals and placeholders are evidence that callers are not making a real decision. They are paying cognitive load to preserve an option the callee could usually infer, default, or split into a rarer entry point.

This detector is intentionally a candidate signal. It points reviewers at APIs where the common call site might become simpler, not at values that are mechanically wrong.

## How

Indexes exported functions and constructors, then resolves direct project call sites through the same import-scope machinery used by cross-file detectors. It considers APIs with at least 3 parameters, plus options-object parameters with at least 5 known keys from a type literal, interface, type alias, or destructuring pattern.

It reports:

- Parameters or options where at least 80% of at least 3 calls pass the same literal, `undefined`, `null`, `{}`, `[]`, or default-like identifier.
- Call sites with multiple `undefined` or `null` placeholder arguments before a later real argument.

Test files and generated files are skipped as evidence.

## When a finding may be acceptable

- **Boundary adapters**: a module mirroring an external system may expose fields to make the mapping obvious. Document that intent if the call sites look repetitive.
- **Small projects**: three identical calls can be early evidence, but not proof. Review whether the repeated value is truly a default or just today's limited sample.

---

**See also:** [`wideSignature`](wide-signature.md) - the arity signal that does not inspect call-site values.
