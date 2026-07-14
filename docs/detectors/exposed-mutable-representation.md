# `exposedMutableRepresentation` - Private state returned by reference

## What

An exported class marks an object, array, `Map`, `Set`, `WeakMap`, or `WeakSet` as private, then a public zero-argument method or getter returns that exact live value with a public return type that permits mutation. The match establishes what callers are allowed to do by the declaration; it does not prove that mutation succeeds at runtime.

```typescript
// Flagged: the public return type permits mutation of the exact private Map.
export class RequestParameters {
  #values = new Map<string, string>();

  values(): Map<string, string> {
    return this.#values;
  }
}
```

The candidate belongs to the exposed field, not to each accessor. If several public members return the same field, Strata reports one candidate and includes every matching member as evidence.

## Why

A private field claims that the class owns its representation. Returning the exact value through a mutable public type permits callers to use a second mutation path outside the class's operations and invariants. Callers also become dependent on the chosen container and its advertised mutation operations, so changing that internal decision can require coordinated changes outside the class.

This is the information-leakage mechanism described by Ousterhout: a design decision reflected across modules creates a dependency between them. His canonical example returns a private parameter map directly and recommends exposing parameter operations instead. Parnas states the corresponding ownership rule: a data structure, its internal relationships, and the procedures that access and modify it should belong to one module rather than be shared across modules.

The detector was selected because it combines three strong facts visible in the declaration: an explicit ownership boundary, exact object identity crossing that boundary, and a public type from a known mutable family. Broader checks for records, aliases, or custom collections cannot establish all three facts reliably. Even here, a finding remains review evidence rather than a verdict.

## How

The detector skips test and generated paths, then requires all of the following. Test paths are excluded because fixtures and helpers are intentionally shaped for testing rather than serving as production design surfaces.

- An undecorated top-level class declaration is directly exported or named by a same-file ESM value export. Named and anonymous default classes are included.
- An undecorated instance field uses `private` or a `#private` name and directly declares or initializes one of the supported mutable families. Constructor parameter properties and inherited, static, optional, declared, computed, or accessor fields are excluded.
- An undecorated public instance method or getter takes no parameters and its entire body returns exactly `this.field` or `this.#field`. Keeping members zero-argument makes this an accessor predicate; parameterized operations are deliberately outside scope. Async, generator, optional, computed, and overloaded members are excluded. Any local overload causes blanket suppression because overload signatures determine the public callable contract, and a syntax-only detector cannot safely select an effective return view.
- If the member declares a return type, that type identifies the same mutable family as the field. A readonly, custom, or otherwise unresolved return view suppresses the candidate.

Supported field evidence is deliberately direct: a type literal containing a non-readonly property or index, an ordinary method, or a setter; `T[]`; or an unshadowed `Array`, `Map`, `Set`, `WeakMap`, or `WeakSet` annotation. These property, index, method, and setter forms count because callers can write through them or replace members. Getter-only and call-signature-only type literals expose observation or invocation rather than writable representation. Direct object literals, array literals, and constructions of those built-ins are recognized when no annotation is present. A `readonly` field modifier does not make the object it references immutable. When a field has an explicit annotation, that annotation is authoritative even if its initializer appears mutable.

## Deliberate false negatives

The detector does not use project-wide type resolution or infer runtime identity through other expressions. It deliberately misses:

- Aliases, unions, intersections, tuples, typed arrays, custom collections, qualified built-ins, factories, calls, assertions, and indirect `Readonly<...>` wrappers. Explicit readonly or unknown field annotations are not replaced with evidence from a mutable initializer.
- Class expressions, CommonJS export assignments, external re-exports, nested classes, and classes exported only through another file. Decorated declarations are excluded because decorators can replace their declared behavior.
- Exposure through local aliases, callbacks, arguments, assertions, conditional paths, or additional statements. Copies, projections, iterators, and wrappers are outside the exact-live-value claim.
- Values exposed to TypeScript through readonly or abstract return types, even though JavaScript consumers may still mutate the runtime object.
- Built-in families whose names are shadowed by a file-level binding, class type parameter, or a member type parameter used by an explicit return type. Uncertainty suppresses the candidate rather than assuming the standard global type.

## Residual false positives

- A project-supplied ambient global can replace a built-in name such as `Map` without a binding visible in the scanned file.
- A separate declaration merge in the same or another file, or a module augmentation, can narrow the public return contract to a readonly view.
- A frozen array or object can retain a writable annotation. Its declared public type permits mutation even though the runtime value prevents it.
- An intentional zero-copy API still matches because its declared public contract deliberately permits mutation of private state. The mechanical evidence about that contract is correct, but the design concern may be acceptable.

## When a finding may be acceptable

- **Deliberate zero-copy APIs**: performance-sensitive buffers and interoperability boundaries may intentionally expose writable memory to avoid allocation or copying. Review whether ownership, lifetime, invalidation, and mutation responsibilities form an explicit public contract. If they do, the exposed representation may be the intended abstraction rather than accidental leakage.
