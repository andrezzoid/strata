# Pre-registration — detector precision labelling

Written and committed **before** any sample was drawn or any label recorded. Nothing below may be revised in the light of results; a change of method starts a new round with its own pre-registration and its own section here.

## Question

Of the candidates strata emits on real code, what share would a competent reviewer agree is worth changing?

Precision, not recall. There is no ground truth for "every design smell in repository X", so recall is not estimable here and no recall number will be reported from this round.

## Why this number and not another

strata's contract is that a finding is a candidate for review, never a verdict. That contract makes precision the load-bearing measurement: a scanner whose candidates are mostly not worth reviewing costs the reviewer more than it saves, whatever else is true of it. It also decides which detectors earn their place.

## Population

The 834 findings in `eval/results/`, produced by strata 0.4.0 over the 11 pinned corpus targets.

Every `duplicateSymbol` finding carries a distinct `fingerprintHash`: the detector already emits one finding per duplicate group, with the group's members in `metadata.occurrences`. So the sampling and labelling unit is the finding, for every detector.

## Sample

Per detector, stratified by repository with proportional allocation, minimum one per repository present:

| Detector                       | Population | Target n        |
| ------------------------------ | ---------- | --------------- |
| `duplicateSymbol`              | 461        | 60              |
| `wideSignature`                | 141        | 40              |
| `passThroughMethod`            | 90         | 40              |
| `passThroughExport`            | 52         | 40              |
| `uniqueImplementation`         | 48         | 40              |
| `forcedRareOption`             | 39         | census (all 39) |
| `exposedMutableRepresentation` | 3          | census (all 3)  |

Any detector with a population under 40 is labelled in full. Selection is a seeded deterministic shuffle within each stratum (`eval/sample.ts`, seed `strata-precision-round-1`), so the sample is reproducible and cannot be redrawn to taste.

This round labels `duplicateSymbol` only. The remaining detectors follow under this same pre-registration.

At n = 60 the 95% Wilson interval is roughly ±12 points near p = 0.5; at n = 40, roughly ±15. These are first-pass estimates meant to rank detectors and expose failure families, not to support fine distinctions between them.

## What the labeller sees

A generated sheet holding, per finding: the detector name, the file and line, and the source of the declarations involved with surrounding context.

The sheet **omits** strata's `message`, its `metadata` beyond the occurrence locations, its evidence strings, and its fingerprint. The message asserts a cause ("agent likely re-built an existing one") and would anchor the answer.

The detector name is unavoidably visible, because it determines which context is worth showing. That is a known weakness of this design and is recorded as such.

## The question put to the labeller

> Would changing this design make the code easier to understand or modify?

Three permitted answers:

- **accept** — yes, a reviewer should act on this.
- **reject** — no, the code is fine as it stands.
- **depends** — cannot be told from the visible context; would need to know something the sheet does not show.

`depends` is a real answer and is reported separately. Folding it into either side would misstate the result.

## Reported statistics

Fixed in advance:

1. **Precision** = accept / (accept + reject), with a 95% Wilson score interval. `depends` excluded from the denominator.
2. **Conservative precision** = accept / (accept + reject + depends). The lower bound if every uncertain case is wrong.
3. **Cause histogram** over rejections. A precision number is a metric; the cause histogram is the work list, and it is the point of the exercise.

## Rejection causes

Fixed before sampling. Derived from six findings inspected during the pilot on `zod`, which is why `zod` remains in the corpus.

| Cause                     | Meaning                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `trivial-body`            | The shared structure is too small to name a concept — an empty array or object, a lone literal. |
| `parallel-by-design`      | Deliberately symmetric siblings, where merging would obscure rather than clarify.               |
| `cross-name-collision`    | The grouped declarations play unrelated roles and share only shape.                             |
| `distinct-domain`         | Same shape, genuinely different concepts; no shared abstraction is available.                   |
| `non-product-path`        | Benchmarks, examples, scripts or fixtures that `skip-patterns.ts` does not exclude.             |
| `intentional-duplication` | Duplication the project chose — a version boundary, a vendored copy, a mirrored public surface. |
| `other`                   | Anything else. A cause used more than twice must be promoted to a named row in the next round.  |

## Who labels, and what that is worth

Round 1 is labelled by Claude, the same agent that built this harness. **A model grading its own tool's output is the weakest link in this design, and the resulting number is provisional.**

It becomes evidence only when a human blind-labels a subset and the agreement rate is published: a 20-finding subset, drawn by the same seeded procedure, labelled without sight of the round-1 labels, reported as raw agreement and Cohen's κ, with the direction of any systematic disagreement stated. Until then no precision figure from this round belongs in the README or in any external claim.

## Stopping rule

Every sampled finding gets a label. A finding is not dropped for being hard — that is what `depends` is for. If a sampled finding cannot be rendered (file gone, path unresolvable) it is recorded as `unrenderable`, counted, and excluded from both denominators.
