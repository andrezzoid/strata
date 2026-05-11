import { describe, expect, it } from "bun:test";

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
    });
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
