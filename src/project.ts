import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
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
  collectRecursive(target, target, out);
  return out.sort();
}

function collectRecursive(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRecursive(root, abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    out.push(toPosix(relative(root, abs)));
  }
}

/** Returns files changed since diffRef, including committed diff, worktree changes, and untracked files. */
export function collectChangedFiles(target: string, diffRef: string): Set<string> {
  const lines = new Set<string>();
  const committed = tryGitOutput(
    `git diff --name-only --diff-filter=ACMR ${shellQuote(diffRef)} -- '*.ts' '*.tsx'`,
    target,
  );
  for (const line of committed.split("\n")) if (line) lines.add(toPosix(line));

  const workingTree = tryGitOutput("git ls-files --modified --others --exclude-standard -- '*.ts' '*.tsx'", target);
  for (const line of workingTree.split("\n")) if (line) lines.add(toPosix(line));

  return new Set([...lines].filter((file) => existsSync(join(target, file))));
}

function tryGitOutput(command: string, cwd: string): string {
  try {
    return execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}
