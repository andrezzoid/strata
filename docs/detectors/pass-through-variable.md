# `passThroughVariable` — Plumbing layer with no contribution

## What

A function or method with three or more parameters that are each forwarded directly into other calls without any local transformation or use.

```typescript
// Flagged: ctx, logger, and config are only forwarded, never used locally
function processRequest(
  req: Request,
  ctx: Context,
  logger: Logger,
  config: Config,
) {
  validate(req);
  handle(req, ctx, logger, config);
}
```

## Why

Where `passThroughMethod` flags a method that is purely a forwarding delegate, `passThroughVariable` flags a function that carries parameters it never applies. The function accepts knowledge it does not use — it is a plumbing layer, threading context through without contributing to its handling.

This is an information-hiding failure in both directions. The caller must supply parameters the function does not understand. The functions being called receive parameters the middle function cannot verify or adapt. The intermediate function adds a layer of names without adding a layer of decisions. The design question is whether that function belongs in the call chain at all, or whether callers should reach the inner functions directly.

## How

Examines each parameter to determine whether it is used locally or only forwarded. A parameter is pass-through if it is never read, compared, branched on, or transformed — its only appearances are as arguments passed into other calls. A finding fires when at least 3 parameters in the same function are all pass-through. The threshold prevents false positives on functions that forward a couple of arguments alongside real logic.

## When a finding may be acceptable

- **Unavoidable context threading**: some frameworks require passing context objects through layers that do not directly use them. If the threading is genuinely imposed by the framework, document it with an inline comment so the intent is legible to the next reader.
- **Dependency injection wiring**: a factory or composition root that accepts and forwards dependencies to constructors may be intentionally thin — its purpose is wiring, not transformation.
