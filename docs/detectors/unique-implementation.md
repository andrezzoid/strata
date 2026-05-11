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

```typescript
// Consider A: remove the interface if no substitution is needed
class UserRepository {
  findById(id: string): Promise<User> { ... }
  save(user: User): Promise<void> { ... }
}

// Consider B: introduce a second implementer in non-test code to justify the abstraction
class InMemoryUserRepository implements UserRepository {
  // test doubles in test files are excluded from analysis and will not clear the finding;
  // this must live in src/ or equivalent production code to count
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

- **Testability seams**: an interface defined to enable mocking in tests has a legitimate purpose even with one production implementer. Note that test doubles in test files are excluded from analysis, so they do not clear the finding — the second implementer must live in production code for the detector to consider it real polymorphism.
- **Anticipated second implementation**: if a second implementation is planned and near, the abstraction is early rather than speculative. Track this explicitly so the finding can be revisited when the second implementation arrives or the plan is abandoned.
- **Framework-required interfaces**: some frameworks require implementing a specific interface even if only one production implementation will ever exist.

---

**See also:** [`duplicateSymbol`](duplicate-symbol.md) — a related AI-introduced pattern: rebuilding existing declarations rather than reusing them.
