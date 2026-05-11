# `orphanFile` — File not reachable from any import

## What

A file that no other scanned file imports — unreachable from the rest of the project graph.

## Why

Unreachable code is inert weight: it is maintained, formatted, reviewed, and compiled alongside live code, but contributes nothing to the running system. Orphan files accumulate in predictable ways: a module is replaced but not deleted; a spike is written but never wired in; a utility is extracted but never used; callers are removed but the module they called is not.

The design concern is that orphan files represent decisions that were never completed. Someone created a module but did not integrate it, or removed all callers but not the module itself. The codebase signals an intention that was abandoned. Over time, orphan files become a form of archaeology — future readers must determine whether the file is dead, in progress, or intentionally isolated, and that determination has no clear answer.

## How

Builds a map of which files are imported by which others across the entire project, resolving path aliases from tsconfig.json. Any file with no incoming imports is a candidate.

The following are excluded, as they are entrypoints or framework-managed files rather than orphans:

- Files named `index`, `main`, `app`, `server`, `cli`, or `bin` (with `.ts` or `.tsx` extension)
- Files under `pages/`, `routes/`, `api/`, `app/`, or `bin/` directories
- `.d.ts` declaration files
- `*.config.ts` configuration files

## When a finding may be acceptable

- **Test helpers loaded by the test runner**: files consumed via glob patterns by Bun, Vitest, or Jest are not statically imported and will appear as orphans. Pass a specific non-test subdirectory as the scan target to limit strata's reach, or use `--exclude orphanFile` to suppress the detector for the whole scan.
- **Scripts and one-off tools**: build scripts, migration scripts, and similar utilities are intentionally standalone. Consider whether they belong in the scanned path at all — if not, exclude their directory from the scan target.
- **Intentional module boundaries**: a file that is a library entrypoint consumed by external packages rather than by files within the scan path will appear as an orphan. Barrel files named `index.ts` are excluded by default; other entrypoint names may need manual exclusion.
