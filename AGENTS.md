# Agent Guidance

This project is grounded in John Ousterhout's _A Philosophy of Software Design_. The scanner exists to focus human or AI judgment on likely complexity red flags; it does not replace that judgment.

## Mindset

- Complexity is anything that makes the system harder to understand or modify.
- A finding is a candidate, never a verdict. The reviewer still decides whether the local design is actually harmful.
- Prefer deep modules: small interfaces hiding substantial, coherent implementation knowledge.
- Avoid shallow wrappers, pass-through methods, and files split only because work happens in sequence.
- Keep knowledge in one place. If changing a format, threshold, mapping, or protocol requires edits in several modules, the design is leaking.
- Generality is valuable only when it makes current use simpler. Do not add plugin machinery or configuration surfaces speculatively.

## Working Rules

- Preserve existing detector semantics unless a test exposes a real bug.
- Write tests before changing detector behavior.
- Keep public interfaces documented enough that callers do not need to read implementation code.
- Add comments for contracts, invariants, and non-obvious tradeoffs; do not translate obvious code into prose.
- Update `README.md`, `CHANGELOG.md`, or `BACKLOG.md` when behavior, release surface, or deferred work changes.

## Architecture Bias

- `scanProject()` should remain the deep core API: callers ask for a scan result, not a sequence of collection, parsing, detector, and formatting steps.
- The CLI should stay thin: argument parsing, invocation, formatting, exit behavior.
- Detector modules should be grouped by the knowledge they own, not one file per tiny helper.
- Cross-file detectors may parse the full project even during `--diff`; filtering happens after analysis so graph-dependent answers stay correct.
