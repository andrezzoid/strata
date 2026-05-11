# Backlog

Future work should earn its complexity. Each item below should be implemented only when a real workflow needs it. Priority favors work that deepens the gap strata occupies: design failures that AI-assisted development introduces and that metric-based tools do not detect.

## CLI & Output

- Detector-owned impact metrics for comparing same-fingerprint findings across refs, followed by `--worsened-since <git-ref>`. Each detector should own which metadata is comparable and what direction is worse, avoiding a generic severity score that would turn candidates into verdicts.
- Union PR gate mode, likely `--regressed-since <git-ref>`, only after `--new-since` and `--worsened-since` prove useful separately. It should report candidate-set regressions, meaning newly introduced or worsened candidate identities, while preserving the scanner's candidate-not-verdict framing.
- Project configuration through `strata.toml` for thresholds and skip patterns.
- Stored baseline support for adopting strata in repositories with existing findings outside a direct git-ref comparison. A baseline should distinguish known candidates from newly introduced ones without changing the scanner's candidate-not-verdict contract.
- Suppression support for intentionally accepted findings, including a required human-readable reason. Suppressions should stay narrow enough to avoid becoming a policy language or hiding broad classes of design signal.

## GitHub & PR Annotations

- GitHub Action console visibility for quiet and failing runs, such as printing the candidate count, whether a summary was written, which scan mode was used, and a compact finding list when candidates are present. This should make direct `main` push failures diagnosable from logs without duplicating the full job summary.
- CI-visible scanner failure reporting so detector or internal scan errors cannot be mistaken for a clean run in automation. Local exploratory scans may keep collecting best-effort findings, but CI-facing modes should surface tool failures distinctly from zero candidates.
- Optional richer PR review integration if native GitHub check annotations are not useful enough for agent or human review, such as Reviewdog or a check-run/comment strategy that supports easier discussion while preserving the no-write-permission default action path.
- Line-scoped PR reporting that distinguishes findings on changed lines from findings elsewhere in changed files, if review noise remains high after `--new-since` and future worsened/regressed modes. This should stay an annotation/UI option rather than a core scanner scope mode.

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

- Circular dependency detection: cycles are the structural form of knowledge encoded in the wrong place — a PoSD violation that no existing detector covers and that AI-generated wiring reliably introduces.
- Unused export detection: a symbol-level replacement for `orphanFile` that surfaces dead interface surface rather than dead files; more precise and catches the speculative-API pattern AI models favour.
- Layer-boundary enforcement once a real project supplies stable layer rules.
- Multi-representation duplication detection for TS types plus runtime schemas.
- Type-aware leakage detection for internal types exposed through public APIs.
- Generic-type single-instantiation detection for speculative generic abstractions.
- Structural code-clone detection if `duplicateSymbol` misses important agent-recreation cases.

## Explicit Non-Goals

- Long-function detection: PoSD argues against length-based splitting as a default design heuristic.
- Cyclomatic complexity scoring: branch count is a poor proxy for interface complexity; SonarQube and Qlty serve this well.
- Security scanning: a different domain with different buyers; Semgrep covers it.
- Style and formatting enforcement: ESLint and Oxlint own this; strata should stay additive to them, not competitive.
- Duplicate literal scanning: prior experiments produced too much noise to guide useful audits.
