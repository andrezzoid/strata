import { statSync } from "node:fs";

import { parseContexts, type Ctx } from "./ast.ts";
import { detectDuplicateSymbol } from "./detectors/duplicate-symbol.ts";
import { detectOrphanFile } from "./detectors/orphan-file.ts";
import { SINGLE_DETECTORS } from "./detectors/single-file.ts";
import { detectUniqueImplementation } from "./detectors/unique-implementation.ts";
import { collectScanFiles, findingTouchesChanged } from "./project.ts";
import { createImportResolver, type ImportResolver } from "./scope.ts";
import type { Finding, ScanResult } from "./types.ts";

type CrossProjectDetector = (ctxs: Ctx[], imports: ImportResolver) => Finding[];

const CROSS_DETECTORS: CrossProjectDetector[] = [
  detectDuplicateSymbol,
  detectUniqueImplementation,
  detectOrphanFile,
];

export type ScanProjectOptions = {
  /** File or directory to scan. Defaults to the current working directory. */
  target?: string;
  /** Git ref for diff-scoped output; full project analysis still runs. */
  diffRef?: string | null;
};

/**
 * Scans a TypeScript project for PoSD-style complexity red-flag candidates.
 *
 * Cross-file detectors always receive the full project graph; `diffRef` only
 * filters emitted findings after analysis so graph-dependent answers stay valid.
 * Returns a Promise because source contents are read through Bun's async file API.
 */
export async function scanProject(options: ScanProjectOptions = {}): Promise<ScanResult> {
  const target = options.target ?? ".";
  if (!statSync(target, { throwIfNoEntry: false })) {
    throw new Error(`no such path: ${target}`);
  }

  const { root, files, changedFiles } = collectScanFiles(target, options.diffRef ?? null);
  const ctxs = await parseContexts(root, files);
  const imports = await createImportResolver(
    root,
    ctxs.map((ctx) => ctx.file),
  );

  let allFindings: Finding[] = [];
  for (const ctx of ctxs) {
    for (const detect of SINGLE_DETECTORS) {
      try {
        allFindings.push(...detect(ctx));
      } catch (error) {
        process.stderr.write(
          `detector ${detect.name} failed on ${ctx.file}: ${(error as Error).message}\n`,
        );
      }
    }
  }
  for (const detect of CROSS_DETECTORS) {
    try {
      allFindings.push(...detect(ctxs, imports));
    } catch (error) {
      process.stderr.write(`cross-detector ${detect.name} failed: ${(error as Error).message}\n`);
    }
  }

  if (changedFiles) {
    allFindings = allFindings.filter((finding) => findingTouchesChanged(finding, changedFiles));
  }

  allFindings.sort(
    (a, b) => a.flag.localeCompare(b.flag) || a.file.localeCompare(b.file) || a.line - b.line,
  );

  const byFlag: Record<string, number> = {};
  for (const finding of allFindings) byFlag[finding.flag] = (byFlag[finding.flag] ?? 0) + 1;

  const fileCounts: Record<string, number> = {};
  for (const finding of allFindings) {
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
    summary: { totalFindings: allFindings.length, byFlag, topFiles },
    findings: allFindings,
  };
}
