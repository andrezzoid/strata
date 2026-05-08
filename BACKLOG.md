# Backlog

Future work should earn its complexity. Each item below should be implemented only when a real workflow needs it.

## CLI & Output

- Detector subset filtering with `--only` and `--exclude`.
- Project configuration through `strata.toml` for thresholds and skip patterns.
- Stable finding fingerprints in JSON and SARIF output so CI systems, agents, and future baselines can recognize the same candidate across harmless line shifts. Fingerprints should be based on detector-owned semantic anchors where possible, not just `file:line`.
- Baseline support for adopting strata in repositories with existing findings. A baseline should distinguish known candidates from newly introduced ones without changing the scanner's candidate-not-verdict contract.
- Suppression support for intentionally accepted findings, including a required human-readable reason. Suppressions should stay narrow enough to avoid becoming a policy language or hiding broad classes of design signal.

## GitHub & Reviewdog

- GitHub Action wrapper that installs/runs strata with minimal workflow glue for pull requests and CI. The action should own integration details only; detector behavior and scan semantics should remain in the CLI.
- Reviewdog support for PR annotations/checks so strata can report candidates on changed lines without requiring GitHub code scanning/SARIF upload. This should complement SARIF rather than replace it.

## Distribution

- GitHub Release binaries after the `oxc-parser` native binding can be packaged or replaced for standalone executables.
- mise installation through the GitHub backend after release assets and checksums exist.
- Homebrew tap after binary release assets are stable; Homebrew core is premature for this project.

## Resolution Accuracy

- Monorepo path alias resolution across multiple package `tsconfig.json` files.
- `tsconfig.json` `extends` chain support for aliases inherited from base configs.
- Namespace import support for scope-aware interface resolution.
- Default-export-of-type support for projects that avoid named type exports.
- Semantic binding for pass-through argument matching to avoid rare shadowing false positives.

## Detector Ideas

- Layer-boundary enforcement once a real project supplies stable layer rules.
- Multi-representation duplication detection for TS types plus runtime schemas.
- Type-aware leakage detection for internal types exposed through public APIs.
- Generic-type single-instantiation detection for speculative generic abstractions.
- Structural code-clone detection if `duplicateSymbol` misses important agent-recreation cases.

## Explicit Non-Goals

- Long-function detection: PoSD argues against length-based splitting as a default design heuristic.
- Cyclomatic complexity scoring: branch count is a poor proxy for interface complexity.
- Duplicate literal scanning: prior experiments produced too much noise to guide useful audits.
