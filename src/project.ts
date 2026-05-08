import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type { Finding } from "./types.ts";

/** File set needed for one scan; changedFiles filters output after full-project analysis. */
export type ScanFileSet = {
  /** Root used for relative finding paths. */
  root: string;
  /** Project-relative TS/TSX files to parse. */
  files: string[];
  /** Changed TS/TSX files for --diff filtering, or null for full output. */
  changedFiles: Set<string> | null;
};

/** Resolves a target path into parse inputs while keeping cross-file detectors graph-correct. */
export function collectScanFiles(target: string, diffRef: string | null): ScanFileSet {
  const targetAbs = resolve(target);
  const targetStat = statSync(targetAbs);
  const root = targetStat.isDirectory() ? targetAbs : resolve(targetAbs, "..");

  if (targetStat.isFile()) {
    return { root, files: [toPosix(relative(root, targetAbs))], changedFiles: null };
  }

  return {
    root,
    files: collectAllProjectFiles(targetAbs),
    changedFiles: diffRef ? collectChangedFiles(targetAbs, diffRef) : null,
  };
}

/** Collects TS/TSX files without shelling out, so scanning works outside Unix-like environments too. */
export function collectAllProjectFiles(target: string): string[] {
  const out: string[] = [];
  const rootGlob = new Bun.Glob("*.{ts,tsx}");
  for (const file of rootGlob.scanSync({ cwd: target, dot: true, onlyFiles: true })) {
    out.push(toPosix(file));
  }

  // Bun.Glob owns recursive matching; the shallow directory pass keeps common
  // top-level dependency/VCS trees out of the expensive recursive scans.
  const nestedGlob = new Bun.Glob("**/*.{ts,tsx}");
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (!entry.isDirectory()) continue;
    for (const file of nestedGlob.scanSync({ cwd: join(target, entry.name), dot: true, onlyFiles: true })) {
      const relativePath = toPosix(join(entry.name, file));
      if (!isProjectFile(relativePath)) continue;
      out.push(relativePath);
    }
  }

  return out.sort();
}

/** Returns files changed since diffRef, including committed diff, worktree changes, and untracked files. */
export function collectChangedFiles(target: string, diffRef: string): Set<string> {
  const lines = new Set<string>();
  const committed = tryGitOutput(
    ["diff", "--name-only", "--diff-filter=ACMR", diffRef, "--", "*.ts", "*.tsx"],
    target,
  );
  for (const line of committed.split("\n")) if (line) lines.add(toPosix(line));

  const workingTree = tryGitOutput(["ls-files", "--modified", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"], target);
  for (const line of workingTree.split("\n")) if (line) lines.add(toPosix(line));

  return new Set([...lines].filter((file) => statSync(join(target, file), { throwIfNoEntry: false })?.isFile()));
}

function tryGitOutput(args: string[], cwd: string): string {
  try {
    const result = Bun.spawnSync(["git", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    return result.success ? (result.stdout?.toString() ?? "") : "";
  } catch {
    // A missing ref or non-git target means "no changed files" for this source.
    return "";
  }
}

/** True when a finding, or one of its related metadata locations, touches the --diff changed set. */
export function findingTouchesChanged(finding: Finding, changed: Set<string>): boolean {
  if (changed.has(finding.file)) return true;
  const occurrences = finding.metadata.occurrences as Array<{ file: string }> | undefined;
  if (occurrences?.some((occurrence) => changed.has(occurrence.file))) return true;
  const implementers = finding.metadata.implementers as Array<{ file: string }> | undefined;
  if (implementers?.some((implementer) => changed.has(implementer.file))) return true;
  return false;
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

function isProjectFile(path: string): boolean {
  const parts = path.split("/");
  return !parts.includes("node_modules") && !parts.includes(".git");
}
