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

## Next

The corpus answers _how much_. It does not answer _how much of it is right_, which is the number that decides whether a candidate scanner is worth running. That needs labelling:

- Stratified sample, fixed N per detector — a uniform sample is majority `duplicateSymbol` and measures little else.
- The labeller sees the code with strata's message **hidden**; showing it anchors the answer.
- Three-way judgement matching the scanner's contract: would changing this design make the code easier to understand or modify — yes / no / depends on context not visible here.
- Record the _cause_ of each rejection, not just the verdict. A precision number is a metric; a cause histogram is a work list.
- The unit is the finding. `duplicateSymbol` already emits one finding per duplicate group, with the group's members in `metadata.occurrences`, so no group-level de-duplication is needed.

The sample size, the question, the rejection causes and the reported statistics are fixed in
[`labelling/PREREGISTRATION.md`](labelling/PREREGISTRATION.md), committed before any sample was drawn.
