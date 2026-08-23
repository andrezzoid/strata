# Round 1 — `duplicateSymbol` precision

Method fixed in advance in [`PREREGISTRATION.md`](PREREGISTRATION.md). Sample drawn by `bun run eval:sample duplicateSymbol`, labels in [`labels/duplicateSymbol.jsonl`](labels/duplicateSymbol.jsonl), reproduce with `bun run eval:labels duplicateSymbol`.

## Result

|                        |                                          |
| ---------------------- | ---------------------------------------- |
| Population             | 461 findings                             |
| Labelled               | 60                                       |
| Verdicts               | 18 accept · 39 reject · 3 depends        |
| **Precision**          | **31.6%**, 95% CI [21.0%, 44.5%], n = 57 |
| Conservative precision | 30.0% (every `depends` counted against)  |

About two in three `duplicateSymbol` candidates are not worth a reviewer's time. Since this detector is 55% of everything strata emits, that number is close to the tool's overall precision as experienced by anyone running it.

**This figure is provisional.** It was produced by the same agent that wrote the detector, and does not become evidence until a human blind-labels a subset and the agreement rate is published.

## Why the 39 rejections were rejected

| Cause                     | n   | Share |
| ------------------------- | --- | ----- |
| `parallel-by-design`      | 14  | 35.9% |
| `intentional-duplication` | 8   | 20.5% |
| `distinct-domain`         | 5   | 12.8% |
| `trivial-body`            | 5   | 12.8% |
| `cross-name-collision`    | 4   | 10.3% |
| `non-product-path`        | 3   | 7.7%  |

### The pilot pointed at the wrong thing

The six findings inspected on `zod` before this round suggested trivial bodies and hash collisions across unrelated names were the problem, and that tightening the triviality guards was the fix. At n = 60 those two families together are 23% of rejections. Fixing them entirely would move precision from 31.6% to roughly 38%.

The real cost is **deliberate structural mirroring**: `parallel-by-design` plus `intentional-duplication` is 22 of 39 rejections, 56%. The detector cannot distinguish "somebody rebuilt this concept" from "these declarations are siblings and must mirror each other". Examples it flagged:

- zod's `classic/` and `mini/` builds, which export the same names over different base classes on purpose — six findings, and the source files say so in comments.
- hono's `adapter/bun/ssg.ts` and `adapter/deno/ssg.ts`, one entry point per runtime.
- Families of per-type factories (`_optional`, `_nullable`, `_success`, `_readonly`) whose whole point is to be one-per-type.
- One locale module per language, identical by construction.

### The other families

`distinct-domain` is, in all five cases, **icon components** — every icon is a function returning `<svg><path d="…"/></svg>`, so they match structurally while sharing nothing extractable.

`non-product-path` is benchmark scripts and vendored dependency trees (`vendor/modules/@xenova/transformers/**`) that `skip-patterns.ts` does not exclude. Cheap to fix, and worth only about 3 points.

## By repository

Small n per repository; orientation only.

| Repo                 | Accept / judged |        |
| -------------------- | --------------- | ------ |
| `mcp-typescript-sdk` | 1/1             | 100.0% |
| `cloudflare-agents`  | 2/3             | 66.7%  |
| `continue`           | 3/6             | 50.0%  |
| `workers-sdk`        | 5/12            | 41.7%  |
| `next`               | 5/18            | 27.8%  |
| `zod`                | 2/13            | 15.4%  |
| `hono`               | 0/3             | 0.0%   |
| `vercel-ai`          | 0/1             | 0.0%   |

`zod` is the worst and is almost entirely its `classic`/`mini` mirror. It contributes six of the eight `intentional-duplication` rejections on its own, so that family is concentrated rather than spread — a second mirrored-surface library would test whether the pattern generalises.

## What the true positives looked like

The 18 accepts are worth reading as a group, because they are what the detector is for and they are unambiguous:

- The same helper copied into two modules — `mutableRequest`, `isStaticRequire`, `afterApplyUpdates`, `convertContainerAffinitiesForApi`, `logBulkProgress`. Several carry the same doc comment in both copies, and one carries a comment admitting it "matches the plugin logic exactly".
- The same knowledge written twice — a localhost allowlist literal in two files, one set of ignore rules in the turbopack and webpack middleware, `Account` and `AccountInfo` in two files of the same module.
- A repeated idiom with no name — seven path helpers all doing join-then-mkdir, three error guards repeating one digest preamble, five copies of an unnamed type-level incantation.

That last group is the most valuable thing the detector does, and nothing else in strata finds it.

## Work this implies

Ranked by rejections removed per unit of effort.

1. **Recognise sibling declarations** (up to 22 rejections). Signals available without new analysis: declarations adjacent in one file differing only in a literal or type argument; parallel directory pairs (`classic/` vs `mini/`, `bun/` vs `deno/`, `app/` vs `pages/`); a group where every member already applies the same existing helper. Some of these are structural facts the detector could read today.
2. **Fix the message.** "agent likely re-built an existing one" asserts a cause that is wrong for at least 68% of what the detector emits, and strata's contract says candidates, not verdicts. The wording should describe the observation, not the history.
3. **Widen `skip-patterns.ts`** (3 rejections) to cover `benchmarks/`, `bench/`, `examples/` and vendored dependency trees.
4. **Guard trivial bodies** (5 rejections) — `return null`, `= []`, `{ success: boolean }`, a lone regex test, a bare `Set<string>` alias. Guards exist for scalar constants but not for type aliases or single-expression bodies.
5. **Icon-shaped components** (5 rejections) need a decision rather than a patch: a function whose body is one JSX element with a large literal attribute matches structurally but is irreducible.

Items 3 and 4 together are worth about 8 points of precision and are small changes. Item 1 is worth up to 25 and is a design question.

## Threats to this result

- **Self-labelling.** The largest one. Stated above and in the pre-registration.
- **The detector name was visible** to the labeller, since it decides what context the sheet renders.
- **Context window.** The sheet shows six lines either side of each declaration. Item 8 was labelled `depends` precisely because the bodies diverged past the window; a wider window might convert some rejections.
- **One dominant repository.** `next` and `zod` are 31 of the 60 labels, and `zod`'s mirror architecture is unusual.
- **Single round, one detector.** Nothing here says anything about the other six.
