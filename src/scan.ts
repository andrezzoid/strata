import { statSync } from "node:fs";

import { parseContexts } from "./ast.ts";
import { selectDetectors, type DetectorSelection } from "./detectors/registry.ts";
import { collectScanFiles, findingTouchesChanged, withBaseSnapshotTarget } from "./project.ts";
import { createImportResolver } from "./scope.ts";
import type { Finding, ScanResult } from "./types.ts";

export type ScanProjectOptions = {
  /** File or directory to scan. Defaults to the current working directory. */
  target?: string;
  /** Git ref for diff-scoped output; full project analysis still runs. */
  diffRef?: string | null;
  /** Git ref for introduced-only output; compares stable finding fingerprints after both scans. */
  newSinceRef?: string | null;
  /** Detector subset to run. Defaults to all detectors. */
  detectorSelection?: DetectorSelection;
};

export type ScanProjectAtGitRefOptions = {
  /** File or directory whose base-ref version should be scanned. Defaults to the current working directory. */
  target?: string;
  /** Commit-ish to use as the filesystem-backed baseline snapshot. */
  ref: string;
  /** Detector subset to run. Defaults to all detectors. */
  detectorSelection?: DetectorSelection;
};

/**
 * Scans a TypeScript project for PoSD-style complexity red-flag candidates.
 *
 * Cross-file detectors always receive the full project graph; `diffRef` and
 * `newSinceRef` filter emitted findings after analysis so graph-dependent
 * answers stay valid.
 * Returns a Promise because source contents are read through Bun's async file API.
 */
export async function scanProject(options: ScanProjectOptions = {}): Promise<ScanResult> {
  const target = options.target ?? ".";
  if (options.diffRef && options.newSinceRef) {
    throw new Error("cannot combine diffRef and newSinceRef");
  }

  const current = await scanFilesystemTarget(
    target,
    options.diffRef ?? null,
    options.detectorSelection,
  );
  if (!options.newSinceRef) return current;

  const base = await scanProjectAtGitRef({
    target,
    ref: options.newSinceRef,
    detectorSelection: options.detectorSelection,
  });
  return filterIntroducedFindings(current, base);
}

/** Scans the requested target as it existed at a git ref, returning an empty result for new paths. */
export async function scanProjectAtGitRef(
  options: ScanProjectAtGitRefOptions,
): Promise<ScanResult> {
  const target = options.target ?? ".";
  return withBaseSnapshotTarget(target, options.ref, async (baseTarget) => {
    if (!baseTarget) return buildScanResult([]);
    return scanFilesystemTarget(baseTarget, null, options.detectorSelection);
  });
}

async function scanFilesystemTarget(
  target: string,
  diffRef: string | null,
  detectorSelection: DetectorSelection | undefined,
): Promise<ScanResult> {
  if (!statSync(target, { throwIfNoEntry: false })) {
    throw new Error(`no such path: ${target}`);
  }

  const { root, files, changedFiles } = collectScanFiles(target, diffRef);
  const ctxs = await parseContexts(root, files);
  const imports = await createImportResolver(
    root,
    ctxs.map((ctx) => ctx.file),
  );
  const detectors = selectDetectors(detectorSelection);

  let allFindings: Finding[] = [];
  for (const ctx of ctxs) {
    for (const detector of detectors.single) {
      try {
        allFindings.push(...detector.detect(ctx));
      } catch (error) {
        process.stderr.write(
          `detector ${detector.id} failed on ${ctx.file}: ${(error as Error).message}\n`,
        );
      }
    }
  }
  for (const detector of detectors.cross) {
    try {
      allFindings.push(...detector.detect(ctxs, imports));
    } catch (error) {
      process.stderr.write(`cross-detector ${detector.id} failed: ${(error as Error).message}\n`);
    }
  }

  if (changedFiles) {
    allFindings = allFindings.filter((finding) => findingTouchesChanged(finding, changedFiles));
  }

  return buildScanResult(allFindings);
}

function filterIntroducedFindings(current: ScanResult, base: ScanResult): ScanResult {
  const baseFingerprints = new Set(base.findings.map((finding) => finding.fingerprint));
  return buildScanResult(
    current.findings.filter((finding) => !baseFingerprints.has(finding.fingerprint)),
  );
}

function buildScanResult(inputFindings: Finding[]): ScanResult {
  const findings = [...inputFindings].sort(
    (a, b) => a.flag.localeCompare(b.flag) || a.file.localeCompare(b.file) || a.line - b.line,
  );

  const byFlag: Record<string, number> = {};
  for (const finding of findings) byFlag[finding.flag] = (byFlag[finding.flag] ?? 0) + 1;

  const fileCounts: Record<string, number> = {};
  for (const finding of findings) {
    if (finding.flag === "duplicateSymbol" && Array.isArray(finding.metadata.occurrences)) {
      for (const occurrence of finding.metadata.occurrences as { file: string }[]) {
        fileCounts[occurrence.file] = (fileCounts[occurrence.file] ?? 0) + 1;
      }
    } else {
      fileCounts[finding.file] = (fileCounts[finding.file] ?? 0) + 1;
    }
  }

  const topFiles = Object.entries(fileCounts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    summary: { totalFindings: findings.length, byFlag, topFiles },
    findings,
  };
}
