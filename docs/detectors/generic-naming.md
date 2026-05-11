# `genericNaming` — Vague name suffix

## What

A class, interface, or type alias whose name ends with a suffix that signals unresolved responsibility: `Manager`, `Helper`, `Wrapper`, `Container`, `Holder`, `Utils`, `Util`, `Misc`, `Common`, `Processor`, or `Handler`.

```typescript
// Flagged
class UserManager { ... }
interface DataHelper { ... }
class RequestProcessor { ... }
```

## Why

A name should reveal what a module *knows* and *decides*, not merely that it does something in a category. `UserManager` tells the reader that it manages users — but what does "manage" mean? What decisions does it own? What knowledge does it encapsulate? The suffix carries no signal about boundaries or responsibility.

These names typically emerge when a responsibility was not resolved during design. The author knew roughly what area the class occupied but not what coherent purpose it served. The result is often a class that accumulates unrelated methods over time, because nothing in its name says no to new additions.

Phil Karlton's observation — that naming is one of the two hard problems in computer science — is precisely because a good name *commits* to a design decision. `UserManager` avoids the commitment. `UserRegistration`, `UserSession`, or `UserPermissions` each commit to something.

## How

Checks the names of classes, interfaces, and type aliases against a fixed list of vague suffixes. Fires once per matching name, regardless of what the declaration contains.

The flagged suffixes are: `Manager`, `Helper`, `Wrapper`, `Container`, `Holder`, `Utils`, `Util`, `Misc`, `Common`, `Processor`, `Handler`.

## When a finding may be acceptable

- **Framework-imposed vocabulary**: some frameworks use these suffixes as part of their own naming conventions. A type named `RequestHandler` because it must satisfy an Express callback signature is framework-constrained, not a design failure.
- **`Handler` as a function type alias**: `type ClickHandler = (e: MouseEvent) => void` is a common and clear TypeScript convention. The suffix is used as a type category marker, not a responsibility label, and the finding here is typically noise.
