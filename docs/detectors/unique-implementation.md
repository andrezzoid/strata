# `uniqueImplementation` — Speculative abstraction

## What

An interface with exactly one implementer, or an abstract class with zero or one subclass — an abstraction layer that has no polymorphism payoff.

```typescript
// Flagged: interface with exactly one implementing class in the project
interface UserRepository {
  findById(id: string): Promise<User>;
  save(user: User): Promise<void>;
}

class PostgresUserRepository implements UserRepository {
  // the only implementer
}
```

## Why

An interface or abstract class exists to enable polymorphism: the ability to substitute one implementation for another at a boundary the caller does not need to know about. That payoff requires at least two real implementations. With only one, the interface costs something — indirection, a type to maintain, imports to manage, a level of naming to traverse — and returns nothing. Callers could reference `PostgresUserRepository` directly at no design cost.

Ousterhout calls this speculative generality: building for flexibility that does not yet exist and may never exist. Parnas's information-hiding criterion applies: what design decision does this interface hide? If the answer is "the specific implementation," that information hiding only pays off when there is a real choice between implementations.

AI coding assistants are particularly prone to this pattern: they default to interface-first design because they have been trained on code that uses interfaces, without the context to know whether the polymorphism is actually needed.

## How

Builds an import-resolved scope for each file using the project's tsconfig.json path aliases. Then, across all scanned files:

1. Collects all `TSInterfaceDeclaration` and abstract `ClassDeclaration` as candidate abstractions.
2. Collects all concrete `ClassDeclaration` that have an `implements` clause or `extends` a known candidate.
3. Resolves cross-file references using the import graph to match implementers to their declaration site.

Firing conditions:

- **Interface**: fires when exactly **1** explicit implementer is found. An interface with 0 implementers is not flagged — it may be forward-declared or consumed by code outside the scan path.
- **Abstract class**: fires when **0 or 1** subclasses are found. Abstract classes cannot be instantiated directly, so zero subclasses means the class is dead code.

Test-only files are excluded from both sides of the analysis.

## When a finding may be acceptable

- **Testability seams**: an interface defined to enable mocking in tests has a legitimate purpose even with one production implementer. The question is whether the interface is actually used in tests — if so, there are effectively two implementations (production and test double).
- **Anticipated second implementation**: if a second implementation is planned and near, the abstraction is early rather than speculative. Track this explicitly so the finding can be revisited when the second implementation arrives or the plan is abandoned.
- **Framework-required interfaces**: some frameworks require implementing a specific interface even if only one production implementation will ever exist.
