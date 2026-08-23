# Evaluation corpus

A pinned set of real TypeScript repositories, scanned by strata, with the results committed.

The fixture suite proves a detector fires on code written to make it fire. This corpus measures what the detectors do to code nobody wrote for us — how much each one fires, which carry the output, and which barely appear. It is also the only place a threshold change becomes observable: adjust a constant, re-run, diff `eval/results/`.

Nothing here judges whether a finding is _correct_. That is the labelling step, and it is not built yet — see [Next](#next).

## Running it

```bash
bun run eval:run             # materialise every pinned repo and scan it (~1 min, ~1.1 GB)
bun run eval:run next zod    # only the named repo ids
bun run eval:report          # summarise the committed results
```

Checkouts land in `eval/.corpus/` (gitignored, reproducible from `corpus.json` at any time). Results land in `eval/results/`, one file per repo target, and are committed. `eval/` is outside the `files` list in `package.json`, so none of it ships to npm.

## How repositories were chosen

Large, actively developed TypeScript, weighted toward codebases with a high measured share of agent-authored commits — strata's thesis is about design debt that AI-assisted development introduces, so mature hand-written libraries alone would measure the wrong thing.

Agent attribution is measured, not assumed: of the 400 commits before the pinned commit, the share whose author or `Co-authored-by` trailer names a known coding agent (`copilot`, `devin-ai`, `cursoragent`, `claude`, `codex`, and similar).

**This is a lower bound on AI involvement, not a measurement of it.** Only commits that _declare_ an agent are counted, and the declaration is per-commit, never per-file. No finding in this corpus may be described as AI-authored on the strength of this number, and the per-band rates in the report are a slice to inspect, not an effect to claim — the bands differ in domain, age and house style at least as much as in agent share.

Targets were then picked for detector spread rather than repo size alone. Three targets exercise all seven detectors; `vercel-ai/packages/ai/src` is the only place `uniqueImplementation` dominates, and `workers-sdk/packages/wrangler/src` the only place `passThroughExport` does. Two low-attribution repos (`hono`, `zod`) are kept as a contrast arm so a per-KLOC number has something to be read against.

## Result files

One JSON file per repo target, holding the pinned commit, file and line counts, the strata version, and the complete finding list.

A result file deliberately carries **no timing and no timestamp**. It must change only when strata's answer changes, or it is worthless as a baseline to diff.

## Reading the report

`bun run eval:report` prints three views: per target, per detector, and per agent-attribution band. The per-detector view is the one that matters most — it shows which detectors carry the output and which are effectively silent on real code.

## Labelling

The corpus answers _how much_. _How much of it is right_ is the labelling round, and it is the number that decides whether a candidate scanner is worth running.

```bash
bun run eval:sample duplicateSymbol   # draw the pre-registered sample, render a blind label sheet
bun run eval:labels duplicateSymbol   # precision, CI, and the rejection-cause histogram
```

Method is fixed in advance in [`labelling/PREREGISTRATION.md`](labelling/PREREGISTRATION.md) — sample sizes, the question, the permitted rejection causes and the reported statistics, all committed before any sample was drawn. The sheet withholds strata's message, evidence and fingerprint, because the message asserts a cause and would anchor the answer.

Results so far:

| Round | Detector          | Precision                  |                                    |
| ----- | ----------------- | -------------------------- | ---------------------------------- |
| 1     | `duplicateSymbol` | 31.6% [21.0, 44.5], n = 57 | [ROUND-1.md](labelling/ROUND-1.md) |

Every figure here is **provisional**: round 1 was labelled by the same agent that wrote the detector. A precision figure earns its way into the README or any external claim only once a human has blind-labelled a subset and the agreement rate is published.

## Next

- Label the remaining six detectors under the same pre-registration.
- Human-validate a 20-finding subset of round 1 and publish raw agreement plus Cohen's κ.
- Act on the round-1 work list, then re-run the corpus and diff `eval/results/` to see the effect.
