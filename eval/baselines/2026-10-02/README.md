# Precision baseline: 2026-10-02

A blind, LLM-labelled estimate of how often strata v0.3.0 and v0.4.0 findings are worth a reviewer's time, measured on four public TypeScript repositories. It's the first data point for detector decisions, not a gate.

## Corpus

| Repo                    | Commit                                     | TS/TSX files |
| ----------------------- | ------------------------------------------ | -----------: |
| `honojs/hono`           | `f23b146afcec63606144cde50b5fbd360dd60238` |          427 |
| `excalidraw/excalidraw` | `ed10ac7dca7e40f3f4a31269b4bfba980d0db41e` |          674 |
| `trpc/trpc`             | `985b76975416fa6b9fdf1e643fdefe6f80b153fc` |        1,022 |
| `twentyhq/twenty`       | `b74f6eaff29c713f27047f8f09a2e0201376dda2` |       29,962 |

Strata versions: `v0.3.0` (`72dd218`) and `v0.4.0` (`8ec52fc`). Each scanned the repo root with `--format json`.

## Method

1. **Strata.** A stratum is a detector population crossed with a repo.
   - `duplicateSymbol` and `uniqueImplementation` produce identical fingerprints in both versions, so they share one population.
   - `passThroughMethod` and `wideSignature` are split by `(flag, file, line)` into findings shared by both versions, `only-v0.3.0`, and `only-v0.4.0`.
2. **Sample.** Up to 10 findings per stratum × repo (all of them when fewer), seed `20261002`, giving 427 items (`items.json`, `sample.ts`).
3. **Blind labelling.** Agents (Claude) labelled the items without seeing the version, following `LABELING.md` and each detector's _What / Why / When acceptable_ docs. They could read and grep the pinned checkouts. Labels are in `labels.json`:
   - `actionable`: the claim is true and a PoSD reviewer would plausibly act on it;
   - `defensible`: the claim is true, but an acceptable case applies (`acceptableCase`) or the cost is negligible (`lowValue`);
   - `wrong`: the claim is false (`mechanical`), or the code isn't design evidence, such as generated, vendored, example or test-scaffolding code (`nonReviewable`).
4. **Agreement.** Two further agents independently relabelled a random 64-item subset (`labels-second.json`).
5. **Estimates.**
   - Per-detector precision is the repo-balanced sample proportion, with a 95% Wilson interval.
   - Per-report precision weights each stratum × repo cell by its population size.
   - The full output is in `results.txt`.

## Results

|                                    | v0.3.0 | v0.4.0 |
| ---------------------------------- | -----: | -----: |
| Findings, 4 repos                  | 25,492 |  1,664 |
| Actionable share (volume-weighted) |     3% |    26% |
| Not-wrong share (volume-weighted)  |    25% |    82% |
| Estimated actionable findings      |   ~650 |   ~430 |

Per detector (repo-balanced sample; volume-weighted figures are in `results.txt`):

| Detector                       | Version |   n | Actionable | Not wrong | Wrong (mechanical / not reviewable) |
| ------------------------------ | ------- | --: | ---------: | --------: | ----------------------------------- |
| `duplicateSymbol`              | both    |  40 |        18% |       60% | 8 / 8                               |
| `passThroughMethod`            | 0.4.0   |  32 |        31% |       94% | 0 / 2                               |
| `passThroughMethod`            | 0.3.0   |  41 |        29% |       76% | 7 / 3                               |
| `wideSignature`                | 0.4.0   |  20 |        15% |      100% | 0 / 0                               |
| `wideSignature`                | 0.3.0   |  41 |        12% |       78% | 2 / 7                               |
| `uniqueImplementation`         | both    |  15 |         0% |       13% | 12 / 1                              |
| `passThroughExport`            | 0.4.0   |  11 |         0% |       82% | 1 / 1                               |
| `forcedRareOption`             | 0.4.0   |   4 |        25% |       75% | 0 / 1                               |
| `exposedMutableRepresentation` | 0.4.0   |   1 |         0% |      100% | 0 / 0                               |
| `orphanFile`                   | 0.3.0   |  40 |         8% |       30% | 20 / 8                              |
| `tsEscapeHatch`                | 0.3.0   |  40 |         5% |       88% | 0 / 5                               |
| `wideModule`                   | 0.3.0   |  40 |         5% |       73% | 0 / 11                              |
| `emptyCatch`                   | 0.3.0   |  40 |         0% |       75% | 0 / 10                              |
| `genericNaming`                | 0.3.0   |  38 |         0% |       92% | 3 / 0                               |
| `passThroughVariable`          | 0.3.0   |  26 |         0% |       42% | 12 / 3                              |
| `shallowModule`                | 0.3.0   |  40 |         0% |       80% | 0 / 8                               |

Labeller agreement on the 64 double-labelled items: 94% on the three-way label (Cohen's κ 0.88); 98% on actionable vs not (κ 0.79); 95% on wrong vs not (κ 0.90).

### What the labels say

- **0.4.0's removals are supported by the data.** No removed detector exceeded 8% actionable.
  - `orphanFile` and `passThroughVariable` were mostly factually wrong. `orphanFile` flagged files imported through aliases, framework-convention entrypoints and package `exports`.
  - The cost is real but small: about a third fewer actionable findings in absolute terms. Most of that loss is `tsEscapeHatch` in twenty, an estimate resting on 2 of 10 sampled findings.
- **`uniqueImplementation` mostly makes false claims.** In 10 of 10 twenty samples the "dead" abstract classes do have subclasses, imported through package-rooted aliases that the scan-root resolver can't follow. Ambient `declare abstract class` types caused the hono cases.
- **`duplicateSymbol` errors come from over-normalisation of small declarations** (string and regex literals, function-type parameter types and `typeof` operands are erased) **and from `examples/` copies.** Its actionable findings are mostly duplicated named constants and functions copied across package boundaries.
- **`passThroughMethod`'s 0.4.0 additions in twenty were all labelled acceptable.** 8 of the 10 were Playwright page-object methods (`clickSignUpButton` forwarding to `click`). Nearly every actionable case was a class that forwards most of its surface; 6 of the 10 in the shared stratum were the same `DrawShapeTrail` class.
- **`wideSignature` in twenty is NestJS dependency-injection constructors.** The actionable cases elsewhere involve parameters derivable from other parameters (`app` plus `app.scene`).

## Caveats

- **LLM labels are not human ground truth.** High agreement between independent agents shows consistency, but agents built on the same model share biases. A human should spot-check before these numbers gate anything.
- **The corpus is mature, human-maintained open source,** not agent-authored code. Precision on AI-written changes, strata's stated target, may differ, and some AI-associated patterns barely occur here.
- **Cells of up to 10 findings give wide intervals.** Twenty's per-report estimates rest on single cells.
- **Findings are correlated.** One class can yield several findings: five sampled `passThroughMethod` items are the same `DrawShapeTrail` design issue.
- **Actionable is a high bar.** Strata emits candidates, so "not wrong" is the trust metric and "actionable" is the value metric.

## Reproduce

```bash
# 1. clone the corpus at the commits above into $STRATA_EVAL_CORPUS/<repo>
# 2. run both versions and store $STRATA_EVAL_WORK/<version>/<repo>.json
bun src/cli.ts "$STRATA_EVAL_CORPUS/hono" --format json > "$STRATA_EVAL_WORK/v0.4.0/hono.json"
# 3. redraw the identical sample and labelling batches
STRATA_EVAL_WORK=... STRATA_EVAL_CORPUS=... STRATA_EVAL_OLD=<v0.3.0 checkout> bun eval/baselines/2026-10-02/sample.ts
# 4. recompute the tables from the committed labels
bun eval/baselines/2026-10-02/analyze.ts
```
