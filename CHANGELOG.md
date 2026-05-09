# Changelog

All notable changes to `strata` will be documented here.

## 0.1.1 - Unreleased

- Focuses the release on CI usage: local scripts and GitHub Actions now cover formatting, linting, typechecking, tests, coverage, package dry-run validation, and source self-scan gating.
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
