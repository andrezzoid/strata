# Changelog

All notable changes to `strata` will be documented here.

## 0.3.1 - Unreleased

- Refines `wideSignature` detection to focus on exported functions and public members of exported classes, excluding private/internal implementation signatures while preserving the required-parameter threshold.
- Refines `passThroughMethod` detection to focus on public class methods that forward same-order arguments to collaborators, adds `return await` support, excludes direct self-delegation and unrelated operation names, and reports class-surface concentration evidence without changing candidate severity.
- Removes the `passThroughVariable` detector from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.
- Removes the `tsEscapeHatch` detector from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.
- Removes the `emptyCatch` and `catchRethrow` detectors from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.
- Removes the `wideModule` detector from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.
- Removes the `shallowModule` detector from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.
- Removes the `genericNaming` detector from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.
- Removes the `orphanFile` detector from the public detector set, including CLI filtering, SARIF metadata, docs, fixtures, and tests.

## 0.3.0 - 2026-05-12

- Adds `strata --version` and shows the installed package version at the top of `strata --help`.
- Improves `--format text` into a first-class local review report with scan context, candidate framing, detector explanations, grouped findings, top files, and compact zero-candidate output.
- Changes the default CLI output from JSON to text; use `--format json` for the structured machine interface.
- Makes scanner and detector operational failures unmistakable: failures now write a `strata scan failed` report to stderr, leave JSON/SARIF stdout empty, and never masquerade as zero-candidate scans.
- Makes GitHub Action logs reuse the CLI text report for scan results, report job-summary status, and forward `strata scan failed` reports without action command boilerplate.

## 0.2.0 - 2026-05-11

- Repositions README and BACKLOG around AI-era design quality: leads with the pattern of design debt that AI coding assistants reliably introduce, grounds the tool in the information-hiding tradition alongside Ousterhout's _A Philosophy of Software Design_, and extends the explicit non-goals to mark the boundary with metric-based and security tools.
- Adds per-detector documentation in `docs/detectors/` covering what each detector flags, the design principle at stake, how detection works, when a finding may be acceptable, and cross-links to related detectors.
- Focuses the release on CI usage: local scripts and GitHub Actions now cover formatting, linting, typechecking, tests, coverage, package dry-run validation, and source self-scan gating.
- Adds a root GitHub Action that runs strata in pull request workflows, emits native annotations, writes a job summary, and can optionally fail after feedback is produced.
- Qualifies GitHub Action annotation paths relative to the repository root, including scans that target a subdirectory.
- Documents how agents and maintainers can retrieve strata check annotations through `gh` without scraping workflow logs.
- Adds SARIF 2.1.0 output through `--format sarif` and `bun run scan:sarif` for GitHub code scanning upload workflows.
- Adds `--fail-on-findings` so CI can fail deliberately when candidates are emitted while default scans remain report-only.
- Adds detector subset filtering with `--only` and `--exclude` so CI jobs and agents can focus on selected candidate families.
- Adds stable finding fingerprints in JSON and SARIF output so CI systems, agents, and future baselines can match candidates across harmless line shifts.
- Adds introduced-only filtering with `--new-since <git-ref>` so PR and CI review can focus on newly introduced candidate identities instead of inherited design debt in changed files.
- Renames changed-file filtering from `--diff <git-ref>` to `--touched-since <git-ref>` so scope modes describe the review question they answer.
- Adds Lefthook pre-commit hooks for staged formatting and linting.
- Adds focused unit coverage for scanner core utilities and detectors.
- Adds scan-root `tsconfig.json` `baseUrl`/`paths` resolution for cross-file `orphanFile` and `uniqueImplementation` analysis.

## 0.1.0 - 2026-05-08

- Migrates the original red-flags scanner into a standalone Bun-native CLI named `strata`.
- Adds project documentation, release notes, backlog, agent guidance, modular source structure, and Bun-native verification.
- Prepares the scoped npm package `@andrezzoid/strata`, which installs the `strata` command for Bun users.
- Adds a package bin launcher so package managers install `strata` through a stable Bun entrypoint.
- Adds a repo-local `/publish` command documenting the release workflow.
