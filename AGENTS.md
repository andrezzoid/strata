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
- Prefer Bun-native runtime APIs: use `Bun.file()`/`Bun.write()` for file contents, `Bun.spawnSync()` or Bun Shell for process execution, `Bun.Glob` for project file discovery, `Bun.fileURLToPath()` for file URL conversion, and `bun:test` for Bun-owned tests. `node:path` remains appropriate for path manipulation, and `node:fs` directory APIs such as `readdir`/`mkdir` remain acceptable where Bun docs still route directory work through Node compatibility.
- Keep public interfaces documented enough that callers do not need to read implementation code.
- Add comments for contracts, invariants, and non-obvious tradeoffs; do not translate obvious code into prose.
- Update `README.md`, `CHANGELOG.md`, or `BACKLOG.md` when behavior, release surface, or deferred work changes.

## Architecture Bias

- `scanProject()` should remain the deep core API: callers ask for a scan result, not a sequence of collection, parsing, detector, and formatting steps.
- The CLI should stay thin: argument parsing, invocation, formatting, exit behavior.
- Detector modules should be grouped by the knowledge they own, not one file per tiny helper.
- Cross-file detectors may parse the full project even during `--touched-since`; filtering happens after analysis so graph-dependent answers stay correct.

## Gotchas

### A git command run in `eval/.corpus/` answers about _this_ repository unless it is fenced

Corpus checkouts live under `eval/.corpus/`, which is inside this repository. Git
walks upward looking for a repository, so a command run in an empty checkout
directory resolves to strata and acts on it. `git remote remove origin` in
`eval/corpus.ts` did exactly that: it deleted strata's own `origin` and every
remote-tracking ref with it, and the `git checkout FETCH_HEAD` that followed was
stopped only by an unrelated dirty working tree. Recovery was `git remote add
origin <url>` plus `git fetch origin`; no commits were lost, because the checkout
aborted.

The fence is two things and both are required. `GIT_CEILING_DIRECTORIES` set to
the parent stops the upward walk, and `assertOwnRepository()` then proves the
walk stopped in the right place by comparing `rev-parse --show-toplevel` against
the directory itself. Detect an existing checkout with `existsSync(dir/.git)`,
never with `git rev-parse --git-dir`, which is itself an upward walk and reports
success from the enclosing repository. `test/eval-corpus.test.ts` is the gate.

Anything that shells out to git in a directory this repo contains needs the same
treatment.
