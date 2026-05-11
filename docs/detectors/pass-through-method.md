# `passThroughMethod` — Layer without logic

## What

A class method whose only statement delegates to an instance property with the same arguments — a naming layer that contributes no behaviour.

```typescript
// Flagged
class OrderService {
  constructor(private repo: OrderRepository) {}

  save(order: Order): Promise<void> {
    return this.repo.save(order); // same name, same args, no logic
  }
}
```

## Why

Martin Fowler named this the _Middle Man_ smell: a class that does nothing but delegate. Ousterhout is more direct — a pass-through method makes the system worse, not better. It adds a new name for the caller to learn, a new frame in the call stack, and zero additional knowledge or protection.

The cost compounds over time. Every maintenance pass must traverse the delegation chain to understand what actually happens. If `OrderService` has five such methods, the reader must track five pairs of names to understand one underlying object. The class presents a surface without a substance.

Free functions are intentionally excluded from this check. A standalone function that wraps a call can legitimately serve as a named abstraction, a typed facade over an untyped dependency, or a stable public name for an unstable internal.

## How

Looks for class methods whose entire body is a single call to an object the class owns, passing the method's own parameters through unchanged and in the same order. Any method that transforms an argument, adds logic, or does anything beyond the delegation is excluded.

## When a finding may be acceptable

- **Interface conformance with future intent**: a method required by an interface may delegate to an inner collaborator as a placeholder, with the expectation that logic will accumulate. The finding is accurate but premature; the correct time to add the method is when the logic arrives.
- **Adapter facades over unstable internals**: if the inner object's type or name is expected to change, a forwarding method decouples callers from the change. This is a legitimate use of indirection, though it should accumulate real logic as the design stabilises.

---

**See also:** [`passThroughVariable`](pass-through-variable.md) — the same plumbing-layer problem expressed through parameters rather than method delegation.
