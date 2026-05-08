# strata

Deterministic candidate scanner for PoSD-style complexity red flags in TypeScript codebases.

`strata` does not judge code. It finds high-recall candidates for an AI or human reviewer to audit through the lens of John Ousterhout's _A Philosophy of Software Design_. Every finding is emitted as `severity: "candidate"`.

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
strata [PATH] --diff <git-ref>
strata [PATH] --format json
strata [PATH] --format text
strata [PATH] --fail-on-findings
```

Defaults:

- `PATH` defaults to the current directory.
- `--format` defaults to `json`.
- `--diff` analyzes the full project graph, then filters findings to changed files so cross-file detectors keep correct context.
- `--fail-on-findings` exits non-zero when candidates are emitted, which is intended for CI gates; default scans remain report-only.

## Output

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
      "file": "src/user-service.ts",
      "line": 8,
      "message": "class method delegates to instance state with same args — layer without logic",
      "metadata": {}
    }
  ]
}
```

Findings are sorted by `(flag, file, line)` for deterministic review and diffing.

## Detectors

| Flag                   | Scope   | Signal                                                                  |
| ---------------------- | ------- | ----------------------------------------------------------------------- |
| `shallowModule`        | file    | API surface is large relative to body lines.                            |
| `wideModule`           | file    | Too many top-level exports.                                             |
| `wideSignature`        | file    | Function, method, or constructor has too many required parameters.      |
| `passThroughMethod`    | file    | Class method delegates to instance state with the same arguments.       |
| `passThroughVariable`  | file    | Several parameters are only forwarded through calls.                    |
| `genericNaming`        | file    | Type/class names end with vague suffixes such as `Manager` or `Helper`. |
| `tsEscapeHatch`        | file    | `as any`, `@ts-ignore`, or `@ts-expect-error`.                          |
| `emptyCatch`           | file    | `catch` clause has no executable statement.                             |
| `catchRethrow`         | file    | `catch` only rethrows the caught value.                                 |
| `duplicateSymbol`      | project | Named declarations with identical structure are repeated.               |
| `uniqueImplementation` | project | Interface or abstract class has no real polymorphism payoff.            |
| `orphanFile`           | project | File is not imported by any other scanned file.                         |

Notably absent: length-based long-function detection. PoSD does not treat length as the primary design problem; shallow interfaces and leaked knowledge are the target.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run scan -- test/fixtures/pass-through-method --format text
```

Tests use Bun's test runner rather than the old shell harness. Fixture tests compare exact `(flag, file, line)` triples for each detector's primary fixture while allowing incidental cross-detector findings.

## Contributing

- Preserve the scanner's contract: candidates, not verdicts.
- Prefer deeper modules over more modules. Split by owned knowledge, not by execution order.
- Add or update a fixture whenever detector behavior changes.
- Keep detector defaults conservative enough that findings focus the review instead of burying it.
- Update `CHANGELOG.md` for release-worthy changes and `BACKLOG.md` for deferred ideas.
