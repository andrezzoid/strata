import { join } from "node:path";

import type { Finding, ScanResult } from "../src/types.ts";

/** User-facing action inputs after defaults and whitespace normalization. */
export type ActionInputs = {
  /** Project path to scan, relative to the workflow workspace. */
  path: string;
  /** Git ref or branch used for introduced-only comparison; absent means full scan. */
  baseRef: string | null;
  /** Comma-separated detector allowlist, passed through to `strata --only`. */
  only: string | null;
  /** Comma-separated detector denylist, passed through to `strata --exclude`. */
  exclude: string | null;
  /** True when findings should fail the action after annotations and summary are emitted. */
  failOnFindings: boolean;
};

/** The scan work the runner must perform after translating action inputs. */
export type ScanPlan = {
  /** Branch name to fetch from origin before scanning, or null when the ref is already local. */
  fetchBranch: string | null;
  /** Arguments passed to the strata CLI after the executable path. */
  scanArgs: string[];
};

/** Normalizes composite-action environment values into the runner's small contract. */
export function normalizeActionInputs(env: Record<string, string | undefined>): ActionInputs {
  return {
    path: trimmedOrNull(env.STRATA_INPUT_PATH) ?? ".",
    baseRef: trimmedOrNull(env.STRATA_INPUT_BASE_REF) ?? trimmedOrNull(env.GITHUB_BASE_REF),
    only: trimmedOrNull(env.STRATA_INPUT_ONLY),
    exclude: trimmedOrNull(env.STRATA_INPUT_EXCLUDE),
    failOnFindings:
      (trimmedOrNull(env.STRATA_INPUT_FAIL_ON_FINDINGS) ?? "").toLowerCase() === "true",
  };
}

/** Converts a PR base branch or explicit git ref into fetch and comparison details. */
export function normalizeBaseRef(ref: string): { fetchBranch: string | null; compareRef: string } {
  const trimmed = ref.trim();
  if (isLocalRevisionExpression(trimmed)) return { fetchBranch: null, compareRef: trimmed };

  const branch = trimmed.replace(/^refs\/heads\//, "").replace(/^origin\//, "");
  return { fetchBranch: branch, compareRef: `origin/${branch}` };
}

/** Builds the strata CLI invocation while keeping action-only behavior outside the scanner. */
export function buildScanPlan(inputs: ActionInputs): ScanPlan {
  if (inputs.only && inputs.exclude) {
    throw new Error("cannot combine action inputs 'only' and 'exclude'");
  }

  let fetchBranch: string | null = null;
  const scanArgs = [inputs.path, "--format", "json"];
  if (inputs.baseRef) {
    const base = normalizeBaseRef(inputs.baseRef);
    fetchBranch = base.fetchBranch;
    scanArgs.push("--new-since", base.compareRef);
  }
  if (inputs.only) scanArgs.push("--only", inputs.only);
  if (inputs.exclude) scanArgs.push("--exclude", inputs.exclude);

  return { fetchBranch, scanArgs };
}

/**
 * Converts scan-root-relative paths back to workflow-root-relative paths.
 *
 * strata reports paths relative to the scan target so CLI output stays compact.
 * GitHub annotations need repository-relative paths to attach to PR files.
 */
export function qualifyResultPaths(result: ScanResult, scanPath: string): ScanResult {
  const prefix = scanPathPrefix(scanPath);
  return {
    summary: {
      ...result.summary,
      topFiles: result.summary.topFiles.map(({ file, count }) => ({
        file: qualifyPath(file, prefix),
        count,
      })),
    },
    findings: result.findings.map((finding) => ({
      ...finding,
      file: qualifyPath(finding.file, prefix),
    })),
  };
}

/** Renders one finding as a GitHub Actions warning annotation. */
export function formatAnnotation(finding: Finding): string {
  const properties = [
    `file=${escapeCommandProperty(finding.file)}`,
    `line=${finding.line}`,
    `title=${escapeCommandProperty(`strata: ${finding.flag}`)}`,
  ];
  const message = `${finding.message}\nfingerprint: ${finding.fingerprint}`;
  return `::warning ${properties.join(",")}::${escapeCommandData(message)}`;
}

/** Renders the GitHub job summary for a full scan result. */
export function formatJobSummary(result: ScanResult): string {
  const total = result.summary.totalFindings;
  const noun = total === 1 ? "candidate" : "candidates";
  const lines = [
    "# strata complexity candidates",
    "",
    `Found **${total}** review ${noun}.`,
    "",
    "strata reports candidate signals, not automated design verdicts. Review each finding through the lens of whether it actually makes the system harder to understand or modify.",
    "",
    "## By detector",
    "",
    "| Detector | Candidates |",
    "| --- | ---: |",
  ];

  for (const [flag, count] of Object.entries(result.summary.byFlag)) {
    lines.push(`| ${flag} | ${count} |`);
  }
  if (Object.keys(result.summary.byFlag).length === 0) lines.push("| None | 0 |");

  lines.push("", "## Top files", "", "| File | Candidates |", "| --- | ---: |");
  for (const { file, count } of result.summary.topFiles) lines.push(`| ${file} | ${count} |`);
  if (result.summary.topFiles.length === 0) lines.push("| None | 0 |");

  return `${lines.join("\n")}\n`;
}

/** Returns the action process exit code after all feedback has been written. */
export function exitCodeForFindings(result: ScanResult, failOnFindings: boolean): 0 | 1 {
  return failOnFindings && result.summary.totalFindings > 0 ? 1 : 0;
}

/** Runs the GitHub Action from environment values and returns the final process code. */
export async function runAction(
  env: Record<string, string | undefined> = process.env,
): Promise<0 | 1> {
  const inputs = normalizeActionInputs(env);
  const plan = buildScanPlan(inputs);
  const workspace = env.GITHUB_WORKSPACE ?? process.cwd();
  const actionPath = env.GITHUB_ACTION_PATH ?? process.cwd();

  if (plan.fetchBranch) fetchBaseBranch(plan.fetchBranch, workspace);

  const scan = runCommand(
    "bun",
    [join(actionPath, "bin", "strata.js"), ...plan.scanArgs],
    workspace,
  );
  const result = qualifyResultPaths(JSON.parse(scan.stdout) as ScanResult, inputs.path);

  for (const candidate of result.findings) process.stdout.write(`${formatAnnotation(candidate)}\n`);
  await writeJobSummary(env.GITHUB_STEP_SUMMARY, formatJobSummary(result));

  return exitCodeForFindings(result, inputs.failOnFindings);
}

function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function scanPathPrefix(scanPath: string): string {
  const normalized = normalizeAnnotationPath(scanPath).replace(/\/+$/, "");
  if (!normalized || normalized === ".") return "";
  if (/\.(tsx?)$/i.test(normalized)) {
    const slash = normalized.lastIndexOf("/");
    return slash === -1 ? "" : normalized.slice(0, slash);
  }
  return normalized;
}

function qualifyPath(file: string, prefix: string): string {
  const normalizedFile = normalizeAnnotationPath(file);
  if (!prefix || normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`)) {
    return normalizedFile;
  }
  return `${prefix}/${normalizedFile}`;
}

function normalizeAnnotationPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isLocalRevisionExpression(ref: string): boolean {
  return (
    /^[0-9a-f]{7,40}$/i.test(ref) ||
    ref === "HEAD" ||
    ref.includes("~") ||
    ref.includes("^") ||
    ref.startsWith("refs/pull/") ||
    ref.startsWith("refs/tags/")
  );
}

function fetchBaseBranch(branch: string, cwd: string): void {
  runCommand(
    "git",
    [
      "fetch",
      "--no-tags",
      "--depth=1",
      "origin",
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ],
    cwd,
  );
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): { stdout: string; stderr: string } {
  const result = Bun.spawnSync([command, ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";
  if (!result.success) {
    throw new Error(`${command} ${args.join(" ")} failed\n${stderr}`.trim());
  }
  return { stdout, stderr };
}

async function writeJobSummary(summaryPath: string | undefined, markdown: string): Promise<void> {
  if (!summaryPath) {
    process.stdout.write(markdown);
    return;
  }

  const summaryFile = Bun.file(summaryPath);
  const existing = (await summaryFile.exists()) ? await summaryFile.text() : "";
  await Bun.write(summaryPath, `${existing}${markdown}`);
}

function escapeCommandData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeCommandProperty(value: string): string {
  return escapeCommandData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

if (import.meta.main) {
  try {
    process.exit(await runAction());
  } catch (error) {
    process.stderr.write(
      `::error title=strata action failed::${escapeCommandData((error as Error).message)}\n`,
    );
    process.exit(1);
  }
}
