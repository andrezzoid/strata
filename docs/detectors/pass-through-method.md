# `passThroughMethod` — Layer without logic

## What

A public class method whose only executable statement forwards its own parameters, unchanged and in the same order, to a collaborator method with the same or closely stemmed name. It is a naming layer that contributes no behaviour.

```typescript
// Flagged
class OrderService {
  constructor(private repo: OrderRepository) {}

  save(order: Order): Promise<void> {
    return this.repo.save(order); // same name, same args, no logic
  }
}
```

```typescript
// Also flagged: await-only forwarding is still just forwarding
class OrderService {
  constructor(private repo: OrderRepository) {}

  async save(order: Order): Promise<void> {
    return await this.repo.save(order);
  }
}
```

```typescript
// Not flagged: the wrapper changes the abstraction by renaming the operation
class OrderService {
  constructor(private repo: OrderRepository) {}

  findOrder(id: string): Promise<Order> {
    return this.repo.loadById(id);
  }
}
```

## Why

Martin Fowler named this the _Middle Man_ smell: a class that does nothing but delegate. Ousterhout is more direct — a pass-through method makes the system worse, not better. It adds a new name for the caller to learn, a new frame in the call stack, and zero additional knowledge or protection.

The cost compounds over time. Every maintenance pass must traverse the delegation chain to understand what actually happens. If `OrderService` has five such methods, the reader must track five pairs of names to understand one underlying object. The class presents a surface without a substance.

Free functions are intentionally excluded from this check so class-method and module-export surfaces stay separate. Exported callable wrappers are covered by [`passThroughExport`](pass-through-export.md); non-exported free functions remain implementation details unless another detector matches them.

## How

Looks for class methods that match all of these conditions:

- The method is public by TypeScript/JavaScript syntax: not `private`, not `protected`, and not `#private`. An underscore prefix such as `_save()` is only a naming convention, so it does not suppress a candidate.
- The method body is exactly one `return collaborator.method(args)`, `return await collaborator.method(args)`, or expression-call statement.
- The receiver is a collaborator owned by the class, such as `this.repo.save(...)`, not direct self-delegation like `this.save(...)`.
- The forwarded arguments are the declared parameters, unchanged and in the same order.
- The callee name equals or shares a leading stem with the wrapper name, such as `invalidate()` forwarding to `invalidateKey()`.

Any method that transforms an argument, reorders arguments, adds logic, calls through `this` directly, or delegates to an unrelated operation name is excluded.

Each finding includes class-surface evidence. The evidence is marked as concentrated when a class has at least 3 pass-through public methods or more than 50% of its public method surface is pass-through. Severity remains `candidate`; concentration is review evidence, not an automatic verdict.

## When a finding may be acceptable

- **Interface conformance with real polymorphism**: a method required by an interface may delegate to an inner collaborator when the interface has multiple meaningful implementations. The finding is still a prompt to review whether this implementation contributes behaviour.
- **Adapter facades over unstable internals**: if the inner object's type or name is expected to change, a forwarding method can decouple callers from the change. This is legitimate when the adapter hides a real decision, not merely a renamed field.
- **Dispatchers and decorators**: dispatchers can route a common API to different implementations, and decorators can add behaviour around a call. If they only forward most methods, concentration evidence should push the reviewer to ask whether the extra layer earns its surface.

---

**See also:**

- [`uniqueImplementation`](unique-implementation.md) — catches speculative interfaces separately; `passThroughMethod` does not try to prove whether an interface has real polymorphism payoff.
- [`passThroughExport`](pass-through-export.md) - catches exported function wrappers without adding class-method assumptions.
