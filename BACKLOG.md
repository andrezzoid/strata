# Backlog

Future work should earn its complexity. Each item below should be implemented only when a real workflow needs it.

## CLI & Output

- SARIF output for GitHub code scanning and IDE annotations.
- Detector subset filtering with `--only` and `--exclude`.
- Project configuration through `strata.toml` for thresholds and skip patterns.

## Distribution

- GitHub Release binaries after the `oxc-parser` native binding can be packaged or replaced for standalone executables.
- mise installation through the GitHub backend after release assets and checksums exist.
- Homebrew tap after binary release assets are stable; Homebrew core is premature for this project.

## Resolution Accuracy

- `tsconfig.json` path alias support for `orphanFile` and `uniqueImplementation`.
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
