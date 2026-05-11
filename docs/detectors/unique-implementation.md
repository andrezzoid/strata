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

Traces `implements` and `extends` relationships across the project, using the import graph to connect each concrete class to the interface or abstract class it references. TypeScript's structural typing means only explicit declarations are counted — a class that satisfies an interface's shape without declaring it is not treated as an implementer.

Interfaces fire when exactly **1** class explicitly implements them. An interface with no implementers is not flagged — it may be forward-declared or consumed by code outside the scan path. Abstract classes fire when they have **0 or 1** subclasses; with zero they are unreachable, with one there is no polymorphism payoff. Test-only files are excluded from both sides of the analysis.

## When a finding may be acceptable

- **Testability seams**: an interface defined to enable mocking in tests has a legitimate purpose even with one production implementer. The question is whether the interface is actually used in tests — if so, there are effectively two implementations (production and test double).
- **Anticipated second implementation**: if a second implementation is planned and near, the abstraction is early rather than speculative. Track this explicitly so the finding can be revisited when the second implementation arrives or the plan is abandoned.
- **Framework-required interfaces**: some frameworks require implementing a specific interface even if only one production implementation will ever exist.
