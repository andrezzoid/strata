import { mkdtempSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Finding } from "./types.ts";

/** File set needed for one scan; changedFiles filters output after full-project analysis. */
export type ScanFileSet = {
  /** Root used for relative finding paths. */
  root: string;
  /** Project-relative TS/TSX files to parse. */
  files: string[];
  /** Touched TS/TSX files for scoped output, or null for full output. */
  changedFiles: Set<string> | null;
};

/** Resolves a target path into parse inputs while keeping cross-file detectors graph-correct. */
export function collectScanFiles(target: string, touchedSinceRef: string | null): ScanFileSet {
  const targetAbs = resolve(target);
  const targetStat = statSync(targetAbs);
  const root = targetStat.isDirectory() ? targetAbs : resolve(targetAbs, "..");

  if (targetStat.isFile()) {
    return { root, files: [toPosix(relative(root, targetAbs))], changedFiles: null };
  }

  return {
    root,
    files: collectAllProjectFiles(targetAbs),
    changedFiles: touchedSinceRef ? collectChangedFiles(targetAbs, touchedSinceRef) : null,
  };
}

/**
 * Runs work against the same target path as it existed at a committed git ref.
 *
 * The callback receives `null` when the target was not present at the ref, which
 * lets scan callers define "new path" as an empty baseline instead of an error.
 * The temporary detached worktree is always outside the scanned tree and is
 * removed before this function resolves or rejects.
 */
export async function withBaseSnapshotTarget<T>(
  target: string,
  ref: string,
  readSnapshot: (snapshotTarget: string | null) => T | Promise<T>,
): Promise<T> {
  const targetPath = resolve(target);
  const targetStat = statSync(targetPath, { throwIfNoEntry: false });
  if (!targetStat) throw new Error(`no such path: ${target}`);
  const targetAbs = realpathSync(targetPath);

  const gitCwd = targetStat.isFile() ? dirname(targetAbs) : targetAbs;
  const repoRoot = resolve(
    gitOutputOrThrow(
      ["rev-parse", "--show-toplevel"],
      gitCwd,
      `target is not inside a git worktree: ${target}`,
    ),
  );
  const targetRelative = relative(repoRoot, targetAbs);
  if (
    targetRelative === ".." ||
    targetRelative.startsWith(`..${sep}`) ||
    isAbsolute(targetRelative)
  ) {
    throw new Error(`target is not inside git root: ${target}`);
  }

  const baseCommit = gitOutputOrThrow(
    ["rev-parse", "--verify", `${ref}^{commit}`],
    repoRoot,
    `invalid git ref: ${ref}`,
  );
  const tempParent = mkdtempSync(join(tmpdir(), "strata-base-snapshot-"));
  const snapshotRoot = join(tempParent, "worktree");
  let worktreeAdded = false;

  try {
    gitOutputOrThrow(
      ["worktree", "add", "--detach", snapshotRoot, baseCommit],
      repoRoot,
      `failed to create base snapshot for ${ref}`,
    );
    worktreeAdded = true;

    const snapshotTarget = targetRelative ? join(snapshotRoot, targetRelative) : snapshotRoot;
    const snapshotTargetStat = statSync(snapshotTarget, { throwIfNoEntry: false });
    return await readSnapshot(snapshotTargetStat ? snapshotTarget : null);
  } finally {
    if (worktreeAdded) removeGitWorktree(repoRoot, snapshotRoot);
    rmSync(tempParent, { recursive: true, force: true });
  }
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
    for (const file of nestedGlob.scanSync({
      cwd: join(target, entry.name),
      dot: true,
      onlyFiles: true,
    })) {
      const relativePath = toPosix(join(entry.name, file));
      if (!isProjectFile(relativePath)) continue;
      out.push(relativePath);
    }
  }

  return out.sort();
}

/** Returns TS/TSX files touched since a git ref, including worktree and untracked files. */
export function collectChangedFiles(target: string, touchedSinceRef: string): Set<string> {
  const lines = new Set<string>();
  const committed = tryGitOutput(
    ["diff", "--name-only", "--diff-filter=ACMR", touchedSinceRef, "--", "*.ts", "*.tsx"],
    target,
  );
  for (const line of committed.split("\n")) if (line) lines.add(toPosix(line));

  const workingTree = tryGitOutput(
    ["ls-files", "--modified", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"],
    target,
  );
  for (const line of workingTree.split("\n")) if (line) lines.add(toPosix(line));

  return new Set(
    [...lines].filter((file) => statSync(join(target, file), { throwIfNoEntry: false })?.isFile()),
  );
}

function tryGitOutput(args: string[], cwd: string): string {
  try {
    const result = Bun.spawnSync(["git", ...args], {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    return result.success ? (result.stdout?.toString() ?? "") : "";
  } catch {
    // A missing ref or non-git target means "no changed files" for this source.
    return "";
  }
}

function gitOutputOrThrow(args: string[], cwd: string, failureMessage: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.success) return (result.stdout?.toString() ?? "").trim();

  const details = result.stderr?.toString().trim();
  throw new Error(details ? `${failureMessage}: ${details}` : failureMessage);
}

function removeGitWorktree(repoRoot: string, snapshotRoot: string): void {
  const result = Bun.spawnSync(["git", "worktree", "remove", "--force", snapshotRoot], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  if (result.success) return;

  rmSync(snapshotRoot, { recursive: true, force: true });
  Bun.spawnSync(["git", "worktree", "prune"], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
}

/** True when a finding, or one of its related metadata locations, touches the scoped file set. */
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
