# strata

Teams using AI coding assistants ship design debt faster than ever. Strata is the automated design reviewer that catches the patterns AI reliably gets wrong — shallow modules, speculative abstractions, pass-through layers — before they compound into architectural problems.

Grounded in Ousterhout's _A Philosophy of Software Design_ and the information-hiding tradition, strata finds high-recall candidates for human or AI review in TypeScript codebases. Every finding is emitted as `severity: "candidate"` — a signal to inspect, not a verdict to enforce.

## Install

Published package:

```bash
bun add -g @andrezzoid/strata
strata --help
```

This first distribution channel is Bun-native and requires `bun` on `PATH`. Standalone binaries, mise, and Homebrew are deferred until binary packaging is proven.

From a local checkout:

```bash
bun install
bun link
strata --help
```

## Usage

```bash
strata [PATH]
strata [PATH] --touched-since <git-ref>
strata [PATH] --new-since <git-ref>
strata [PATH] --format json
strata [PATH] --format text
strata [PATH] --format sarif
strata [PATH] --only passThroughMethod,duplicateSymbol
strata [PATH] --exclude orphanFile,genericNaming
strata [PATH] --fail-on-findings
strata --version
```

Defaults:

- `PATH` defaults to the current directory.
- `--format` defaults to `text`, the local review report.
- `--format sarif` emits SARIF 2.1.0 for GitHub code scanning and other CI consumers.
- Scan scope modes are mutually exclusive review questions: touched files, new candidate identities, future worsened existing candidates, or their future union.
- `--touched-since` analyzes the full project graph, then filters findings to files touched since the git ref so cross-file detectors keep correct context.
- `--new-since` scans the current target and the base ref, then reports only current candidates whose stable `fingerprint` was absent from the base scan.
- `--only` and `--exclude` accept comma-separated detector IDs from the table below. They filter which detectors run, not how findings are judged; every emitted finding remains a review candidate.
- `--fail-on-findings` exits non-zero when candidates are emitted, which is intended for CI gates; default scans remain report-only.
- `--version` prints the installed `strata` package version. `--help` also starts with the same version line.

Project resolution:

- `strata` reads `tsconfig.json` from the scan root for cross-file analysis.
- Supported today: direct `compilerOptions.baseUrl` and exact or wildcard `compilerOptions.paths` mappings.
- Aliases resolve only to scanned `.ts` and `.tsx` files; package imports stay external.
- First-version limit: no monorepo tsconfig selection, project references, or `extends` chain evaluation.

## Output

### Text For Local Review

Text output is the default because it is the local human/agent review interface:

```bash
strata .
strata . --format text
```

Example with candidates present:

```text
strata complexity candidates
Mode: full scan
Target: .

Found 4 review candidates.

These are candidate signals, not automated design verdicts. Review whether
each finding actually makes the system harder to understand or modify.

By detector:
  orphanFile         1
  passThroughMethod  2
  shallowModule      1

Top files:
  4  case.ts

passThroughMethod
  Suspicious when a method only forwards to another object; the layer may add API surface without hiding useful complexity.

  case.ts:7
    class method delegates to instance state with same args - layer without logic

  case.ts:11
    class method delegates to instance state with same args - layer without logic
```

Introduced-only text answers a different review question: which candidate identities did this change create?

```bash
strata . --new-since origin/main --format text
```

```text
strata complexity candidates
Mode: introduced candidates
Target: .
Base ref: origin/main

Found 1 review candidate introduced since origin/main.

These are candidate signals, not automated design verdicts. Inherited
candidates are omitted by fingerprint; omitted does not mean approved.

By detector:
  passThroughMethod  1

Top files:
  1  src/new-service.ts

passThroughMethod
  Suspicious when a method only forwards to another object; the layer may add API surface without hiding useful complexity.

  src/new-service.ts:3
    class method delegates to instance state with same args - layer without logic
```

Example when no enabled detector matches the selected scope:

```text
strata complexity candidates
Mode: introduced candidates
Target: .
Base ref: origin/main

No review candidates were emitted for this scan.

This is not a verdict that the design is clean. It only means no enabled
detector matched the selected scope.
```

Text output teaches the review model and stays compact: detector groups include a short explanation, findings include locations and human evidence, and empty sections are omitted. It intentionally omits fixed `severity`, raw metadata, and finding fingerprints. Use JSON or SARIF when another tool needs stable machine identity.

### Operational Failures

Scanner or detector failures are not zero-candidate scans. If strata cannot compute the requested scope or a detector crashes, it writes a failure report to stderr, exits non-zero, and does not emit text, JSON, or SARIF candidate output on stdout:

```text
strata scan failed
Mode: introduced candidates
Target: .
Base ref: missing-ref

Reason: invalid git ref: missing-ref

No trustworthy candidate report was produced.
```

For `--format json` and `--format sarif`, stdout is reserved for completed scan results. Operational failures still use the stderr report above so tool consumers do not accidentally parse partial findings as trustworthy output.

### JSON For Tools

Use JSON when another tool needs the stable structured result, including finding fingerprints:

```bash
strata . --format json
```

```json
{
  "summary": {
    "totalFindings": 1,
    "byFlag": { "passThroughMethod": 1 },
    "topFiles": [{ "file": "src/user-service.ts", "count": 1 }]
  },
  "findings": [
    {
      "flag": "passThroughMethod",
      "severity": "candidate",
      "fingerprint": "strata:v1:1c5zo4q",
      "file": "src/user-service.ts",
      "line": 8,
      "message": "class method delegates to instance state with same args — layer without logic",
      "metadata": {}
    }
  ]
}
```

Findings are sorted by `(flag, file, line)` for deterministic review and diffing. Each finding has a versioned `fingerprint` so CI systems, agents, and future baselines can match the same candidate across harmless line shifts. Fingerprints are stable identifiers for review workflow state; they are not judgments and are not promised across file renames or detector semantic changes.

### GitHub Action For PRs

Recommended non-blocking pull request workflow:

```yaml
name: strata

on:
  pull_request:

permissions:
  contents: read

jobs:
  complexity-candidates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: andrezzoid/strata@v0.1.1
```

The action emits native GitHub warning annotations plus a job summary. It does not need write permissions because it uses workflow commands and `GITHUB_STEP_SUMMARY`, not PR comments.

Defaults:

- `path` defaults to `.`.
- On pull requests, the action fetches the base branch and runs introduced-only scanning with `--new-since origin/<base>`.
- Outside pull request contexts, no base ref is available, so the action runs a normal scan.
- Findings do not fail the job unless `fail-on-findings` is enabled.

Inputs:

| Input              | Default | Description                                                |
| ------------------ | ------- | ---------------------------------------------------------- |
| `path`             | `.`     | File or directory to scan.                                 |
| `base-ref`         | PR base | Git branch or ref for introduced-only comparison.          |
| `only`             |         | Comma-separated detector IDs to run.                       |
| `exclude`          |         | Comma-separated detector IDs to skip.                      |
| `fail-on-findings` | `false` | Set to `true` to fail after annotations and summary write. |

Blocking gate example:

```yaml
- uses: andrezzoid/strata@v0.1.1
  with:
    only: passThroughMethod,duplicateSymbol
    fail-on-findings: "true"
```

SARIF upload and Reviewdog are optional advanced integrations. Prefer the action above first; use SARIF when your team already relies on GitHub code scanning, or feed JSON/SARIF into Reviewdog if you want richer check-run behavior from your existing Reviewdog setup.

Agents can retrieve the same GitHub check annotations through `gh` without scraping logs:

```bash
gh pr checks <pr> --json name,state,bucket,link
gh run view <run-id> --json jobs
gh api repos/<owner>/<repo>/check-runs/<check-run-id>/annotations \
  --jq '.[] | select(.title | startswith("strata:")) | {path,start_line,title,message}'
```

GitHub exposes these as check annotations, not commentable PR review comments. The annotation `path` is repository-relative even when the action scans a subdirectory with `path: src`.

### SARIF For CI

Generate a SARIF log for GitHub code scanning:

```bash
strata . --format sarif > strata.sarif
```

Touched-file SARIF keeps full-project graph analysis, then reports only findings that touch files changed since a git ref:

```bash
strata . --touched-since origin/main --format sarif > strata.sarif
```

Introduced-only SARIF answers a different PR-review question: which candidate identities did this change create?

```bash
strata . --new-since origin/main --format sarif > strata.sarif
```

Use `--new-since` for CI annotations or gates that should focus on newly introduced review candidates rather than inherited design debt in files the PR happened to edit. "New" means a new finding fingerprint identity; if an existing same-fingerprint candidate merely worsens its metadata, such as a wide module gaining another export, it is not reported as introduced by this mode.

Focus CI annotations or gates on detector families your team is ready to review:

```bash
strata . --new-since origin/main --only passThroughMethod,duplicateSymbol --format sarif > strata.sarif
strata . --new-since origin/main --exclude orphanFile --fail-on-findings
```

Example GitHub Actions upload step:

```yaml
- run: bunx @andrezzoid/strata . --format sarif > strata.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: strata.sarif
```

SARIF is for annotations and review workflow integration. If you want a blocking quality gate, run `strata . --fail-on-findings` as a separate CI step so candidates fail the job deliberately rather than being confused with SARIF upload behavior.

SARIF `partialFingerprints.primaryLocationLineHash` uses the same value as JSON `finding.fingerprint`, based on detector-owned semantic anchors where available rather than raw `file:line` identity.

## Detectors

Each detector targets a design failure that AI-assisted workflows reliably introduce and that cyclomatic-complexity or style tools do not see.

| Flag                                                              | Scope   | Signal                                                                  |
| ----------------------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| [`shallowModule`](docs/detectors/shallow-module.md)               | file    | API surface is large relative to body lines.                            |
| [`wideModule`](docs/detectors/wide-module.md)                     | file    | Too many top-level exports.                                             |
| [`wideSignature`](docs/detectors/wide-signature.md)               | file    | Function, method, or constructor has too many required parameters.      |
| [`passThroughMethod`](docs/detectors/pass-through-method.md)      | file    | Class method delegates to instance state with the same arguments.       |
| [`passThroughVariable`](docs/detectors/pass-through-variable.md)  | file    | Several parameters are only forwarded through calls.                    |
| [`genericNaming`](docs/detectors/generic-naming.md)               | file    | Type/class names end with vague suffixes such as `Manager` or `Helper`. |
| [`tsEscapeHatch`](docs/detectors/ts-escape-hatch.md)              | file    | `as any`, `@ts-ignore`, or `@ts-expect-error`.                          |
| [`emptyCatch`](docs/detectors/empty-catch.md)                     | file    | `catch` clause has no executable statement.                             |
| [`catchRethrow`](docs/detectors/catch-rethrow.md)                 | file    | `catch` only rethrows the caught value.                                 |
| [`duplicateSymbol`](docs/detectors/duplicate-symbol.md)           | project | Named declarations with identical structure are repeated.               |
| [`uniqueImplementation`](docs/detectors/unique-implementation.md) | project | Interface or abstract class has no real polymorphism payoff.            |
| [`orphanFile`](docs/detectors/orphan-file.md)                     | project | File is not imported by any other scanned file.                         |

Notably absent: long-function detection, cyclomatic complexity scoring. Both are well-served by existing tools. Strata occupies the gap they leave — the design layer between "this function is complex" and "this module is not earning its abstraction."

## Development

```bash
bun install
bun run hooks:install
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run package:check
bun run scan:ci
bun run scan:sarif
bun run scan -- test/fixtures/pass-through-method --format text
```

Tests use Bun's test runner rather than the old shell harness. Fixture tests compare exact `(flag, file, line)` triples for each detector's primary fixture while allowing incidental cross-detector findings.

Lefthook installs the repo's Git hooks during local dependency installation; run `bun run hooks:install` if you need to repair or reinstall them manually. The pre-commit hook formats staged JS/TS, JSON, Markdown, and YAML files with Oxfmt, re-stages fixes, then lints staged JS/TS files with Oxlint. It intentionally skips full tests and coverage so commits stay fast; GitHub Actions still runs the complete gate before merge.

GitHub Actions runs the local gate scripts before merge. `bun run test:coverage` gates LCOV line coverage for `src/` at 85%, which matches the current machine-readable aggregate rather than Bun's human table. `bun run package:check` runs `npm pack --dry-run --json` to validate package contents without publishing.

`bun run scan:ci` runs `strata src --fail-on-findings`. A failing self-scan means the source now contains review candidates that should be fixed or intentionally redesigned; it is still a candidate signal, not an automated final verdict. `bun run scan:sarif` emits the same source scan as SARIF for CI smoke tests or upload workflows. Publish automation is intentionally deferred until release credentials and side effects are handled in a separate change.

## Contributing

- Preserve the scanner's contract: candidates, not verdicts.
- New detectors should target design failures that metric-based tools miss; avoid duplicating what ESLint, SonarQube, or similar tools already cover.
- Prefer deeper modules over more modules. Split by owned knowledge, not by execution order.
- Add or update a fixture whenever detector behavior changes.
- Keep detector defaults conservative enough that findings focus the review instead of burying it.
- Update `CHANGELOG.md` for release-worthy changes and `BACKLOG.md` for deferred ideas.
