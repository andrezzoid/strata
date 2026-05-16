import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildScanPlan,
  exitCodeForFindings,
  formatAnnotation,
  formatJobSummary,
  normalizeActionInputs,
  normalizeBaseRef,
  qualifyResultPaths,
} from "../action/strata-action.ts";
import type { Finding, ScanResult } from "../src/types.ts";

const finding: Finding = {
  flag: "passThroughMethod",
  severity: "candidate",
  fingerprint: "strata:v1:abc123",
  file: "src/service,api.ts",
  line: 12,
  message: "class method delegates with 100% matching args\nreview this layer",
  metadata: {},
};

const result: ScanResult = {
  summary: {
    totalFindings: 1,
    byFlag: { passThroughMethod: 1 },
    topFiles: [{ file: "src/service.ts", count: 1 }],
  },
  findings: [finding],
};

function runActionScript(env: Record<string, string>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const workspace = process.cwd();
  const run = Bun.spawnSync(["bun", "action/strata-action.ts"], {
    cwd: workspace,
    env: {
      ...process.env,
      GITHUB_ACTION_PATH: workspace,
      GITHUB_WORKSPACE: workspace,
      ...env,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: run.exitCode,
    stdout: run.stdout.toString(),
    stderr: run.stderr.toString(),
  };
}

async function writeFakeStrataCli(actionPath: string, source: string): Promise<void> {
  mkdirSync(join(actionPath, "bin"), { recursive: true });
  await Bun.write(join(actionPath, "bin", "strata.js"), source);
}

describe("GitHub Action runner", () => {
  it("ships root composite action metadata with a minimal input surface", async () => {
    const metadata = await Bun.file("action.yml").text();

    expect(metadata).toContain("using: composite");
    expect(metadata).toContain("STRATA_INPUT_PATH");
    expect(metadata).toContain("STRATA_INPUT_BASE_REF");
    expect(metadata).toContain("STRATA_INPUT_ONLY");
    expect(metadata).toContain("STRATA_INPUT_EXCLUDE");
    expect(metadata).toContain("STRATA_INPUT_FAIL_ON_FINDINGS");
    expect(metadata).not.toContain("sarif");
  });

  it("normalizes action inputs with PR-friendly defaults", () => {
    expect(
      normalizeActionInputs({
        GITHUB_BASE_REF: "main",
        STRATA_INPUT_PATH: "",
        STRATA_INPUT_ONLY: " passThroughMethod,duplicateSymbol ",
        STRATA_INPUT_EXCLUDE: "",
        STRATA_INPUT_FAIL_ON_FINDINGS: "true",
      }),
    ).toEqual({
      path: ".",
      baseRef: "main",
      only: "passThroughMethod,duplicateSymbol",
      exclude: null,
      failOnFindings: true,
    });
  });

  it("normalizes branch-like base refs to fetchable origin refs", () => {
    expect(normalizeBaseRef("main")).toEqual({ fetchBranch: "main", compareRef: "origin/main" });
    expect(normalizeBaseRef("origin/release/next")).toEqual({
      fetchBranch: "release/next",
      compareRef: "origin/release/next",
    });
    expect(normalizeBaseRef("HEAD~1")).toEqual({ fetchBranch: null, compareRef: "HEAD~1" });
  });

  it("builds scan arguments without leaking action failure behavior into the CLI", () => {
    expect(
      buildScanPlan({
        path: "packages/app",
        baseRef: "main",
        only: "passThroughMethod,duplicateSymbol",
        exclude: null,
        failOnFindings: true,
      }),
    ).toEqual({
      fetchBranch: "main",
      scanArgs: [
        "packages/app",
        "--format",
        "json",
        "--new-since",
        "origin/main",
        "--only",
        "passThroughMethod,duplicateSymbol",
      ],
      textReportContext: {
        mode: "introduced",
        target: "packages/app",
        ref: "origin/main",
      },
    });
  });

  it("prints the CLI text report to action logs when a job summary is configured", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-action-summary-"));
    try {
      const summaryPath = join(root, "summary.md");
      const run = runActionScript({
        STRATA_INPUT_PATH: "test/fixtures/pass-through-method",
        GITHUB_STEP_SUMMARY: summaryPath,
      });

      expect(run.status).toBe(0);
      expect(run.stdout).toContain(
        "strata complexity candidates\nMode: full scan\nTarget: test/fixtures/pass-through-method\n",
      );
      expect(run.stdout).toContain("Found 3 review candidates.");
      expect(run.stdout).toContain("GitHub job summary: written");
      expect(run.stdout).toContain("::warning file=test/fixtures/pass-through-method/case.ts");
      expect(await Bun.file(summaryPath).text()).toContain("# strata complexity candidates");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints CLI zero-candidate text to action logs instead of going silent", () => {
    const root = mkdtempSync(join(tmpdir(), "strata-action-zero-"));
    try {
      const run = runActionScript({
        STRATA_INPUT_PATH: "test/fixtures/pass-through-method",
        STRATA_INPUT_ONLY: "genericNaming",
        GITHUB_STEP_SUMMARY: join(root, "summary.md"),
      });

      expect(run.status).toBe(0);
      expect(run.stdout).toContain(
        "strata complexity candidates\nMode: full scan\nTarget: test/fixtures/pass-through-method\n",
      );
      expect(run.stdout).toContain("No review candidates were emitted for this scan.");
      expect(run.stdout).toContain("GitHub job summary: written");
      expect(run.stdout).not.toContain("::warning");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints normal candidate output before failing on findings", () => {
    const root = mkdtempSync(join(tmpdir(), "strata-action-fail-findings-"));
    try {
      const run = runActionScript({
        STRATA_INPUT_PATH: "test/fixtures/pass-through-method",
        STRATA_INPUT_FAIL_ON_FINDINGS: "true",
        GITHUB_STEP_SUMMARY: join(root, "summary.md"),
      });

      expect(run.status).toBe(1);
      expect(run.stdout).toContain("Found 3 review candidates.");
      expect(run.stdout).toContain("GitHub job summary: written");
      expect(run.stdout).toContain("::warning file=test/fixtures/pass-through-method/case.ts");
      expect(run.stderr).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("forwards CLI scan failures without action command boilerplate", () => {
    const run = runActionScript({
      STRATA_INPUT_PATH: "test/fixtures/pass-through-method",
      STRATA_INPUT_BASE_REF: "HEAD~999999",
    });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toStartWith(
      "strata scan failed\nMode: introduced candidates\nTarget: test/fixtures/pass-through-method\nBase ref: HEAD~999999\n",
    );
    expect(run.stderr).toContain("No trustworthy candidate report was produced.");
    expect(run.stderr).not.toContain("bun ");
    expect(run.stderr).not.toContain("strata action failed");
  });

  it("forwards detector failure reports from the scan command", async () => {
    const actionPath = mkdtempSync(join(tmpdir(), "strata-action-fake-cli-"));
    try {
      await writeFakeStrataCli(
        actionPath,
        `#!/usr/bin/env bun
process.stderr.write("strata scan failed\\nMode: full scan\\nTarget: .\\n\\nReason: detector throwSingle failed on case.ts: forced detector failure\\n\\nNo trustworthy candidate report was produced.\\n");
process.exit(1);
`,
      );

      const run = runActionScript({
        GITHUB_ACTION_PATH: actionPath,
        STRATA_INPUT_PATH: ".",
      });

      expect(run.status).toBe(1);
      expect(run.stdout).toBe("");
      expect(run.stderr).toStartWith("strata scan failed\nMode: full scan\nTarget: .\n");
      expect(run.stderr).toContain("detector throwSingle failed on case.ts");
      expect(run.stderr).not.toContain("bun ");
      expect(run.stderr).not.toContain("strata action failed");
    } finally {
      rmSync(actionPath, { recursive: true, force: true });
    }
  });

  it("renders escaped GitHub warning annotations", () => {
    expect(formatAnnotation(finding)).toBe(
      "::warning file=src/service%2Capi.ts,line=12,title=strata%3A passThroughMethod::class method delegates with 100%25 matching args%0Areview this layer%0Afingerprint: strata:v1:abc123",
    );
  });

  it("qualifies scan-root-relative findings for GitHub annotations", () => {
    const scanRootResult: ScanResult = {
      summary: {
        totalFindings: 1,
        byFlag: { passThroughMethod: 1 },
        topFiles: [{ file: "types.ts", count: 1 }],
      },
      findings: [{ ...finding, file: "types.ts" }],
    };

    const qualified = qualifyResultPaths(scanRootResult, "src");

    expect(qualified.findings[0]?.file).toBe("src/types.ts");
    expect(qualified.summary.topFiles[0]?.file).toBe("src/types.ts");
    expect(formatAnnotation(qualified.findings[0]!)).toContain("file=src/types.ts");
  });

  it("renders a job summary that preserves candidate-not-verdict framing", () => {
    const summary = formatJobSummary(result);

    expect(summary).toContain("# strata complexity candidates");
    expect(summary).toContain("Found **1** review candidate.");
    expect(summary).toContain("candidate signals, not automated design verdicts");
    expect(summary).toContain("| passThroughMethod | 1 |");
    expect(summary).toContain("| src/service.ts | 1 |");
  });

  it("fails only when action-level gating is enabled and findings exist", () => {
    expect(exitCodeForFindings(result, false)).toBe(0);
    expect(exitCodeForFindings(result, true)).toBe(1);
    expect(
      exitCodeForFindings(
        { summary: { totalFindings: 0, byFlag: {}, topFiles: [] }, findings: [] },
        true,
      ),
    ).toBe(0);
  });
});
