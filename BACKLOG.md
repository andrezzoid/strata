# Backlog

Future work should earn its complexity. Each item below should be implemented only when a real workflow needs it.

## CLI & Output

- Project configuration through `strata.toml` for thresholds and skip patterns.
- Baseline support for adopting strata in repositories with existing findings. A baseline should distinguish known candidates from newly introduced ones without changing the scanner's candidate-not-verdict contract.
- Suppression support for intentionally accepted findings, including a required human-readable reason. Suppressions should stay narrow enough to avoid becoming a policy language or hiding broad classes of design signal.

## GitHub & PR Annotations

- GitHub Action wrapper that installs/runs strata with minimal workflow glue for pull requests and CI. The action should own integration details only; detector behavior and scan semantics should remain in the CLI.
- Native GitHub Actions annotations and job summaries for PR red-flag candidates, preferably through the action rather than a required third-party reporter. This should avoid write-permission dependencies where possible, keep SARIF upload optional for code-scanning users, and document Reviewdog as an optional richer-checks recipe rather than the default path.
- Line-scoped PR reporting that distinguishes findings on changed lines from findings elsewhere in changed files, if review noise proves high enough to justify the extra diff-range machinery.

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
