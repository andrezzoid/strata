import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "bun:test";

const here = dirname(Bun.fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cli = join(repoRoot, "src/cli.ts");
const bin = join(repoRoot, "bin/strata.js");
const passThroughFixture = join(repoRoot, "test/fixtures/pass-through-method");

function runStrata(args: string[]) {
  const result = Bun.spawnSync(["bun", cli, ...args], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: result.exitCode,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

function runPackagedBin(args: string[]) {
  const result = Bun.spawnSync(["bun", bin, ...args], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: result.exitCode,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

describe("CLI", () => {
  it("prints JSON by default", () => {
    const result = runStrata([passThroughFixture]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.summary.totalFindings).toBeGreaterThan(0);
    expect(
      parsed.findings.some((finding: { flag: string }) => finding.flag === "passThroughMethod"),
    ).toBe(true);
  });

  it("keeps default scans report-only when findings exist", () => {
    const result = runStrata([passThroughFixture]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).summary.totalFindings).toBeGreaterThan(0);
  });

  it("fails when requested and findings exist", () => {
    const result = runStrata([passThroughFixture, "--fail-on-findings"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).summary.totalFindings).toBeGreaterThan(0);
  });

  it("passes with --fail-on-findings when no findings exist", () => {
    const root = mkdtempSync(join(tmpdir(), "strata-cli-empty-"));
    try {
      const result = runStrata([root, "--fail-on-findings"]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).summary.totalFindings).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints text output", () => {
    const result = runStrata([passThroughFixture, "--format", "text"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Total:");
    expect(result.stdout).toContain("[passThroughMethod] case.ts:7");
  });

  it("prints SARIF output", () => {
    const result = runStrata([passThroughFixture, "--format", "sarif"]);

    expect(result.status).toBe(0);
    const sarif = JSON.parse(result.stdout);
    expect(sarif.version).toBe("2.1.0");
    expect(
      sarif.runs[0].results.some(
        (finding: { ruleId: string }) => finding.ruleId === "passThroughMethod",
      ),
    ).toBe(true);
  });

  it("can fail on findings after writing SARIF", () => {
    const result = runStrata([passThroughFixture, "--format", "sarif", "--fail-on-findings"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).runs[0].results.length).toBeGreaterThan(0);
  });

  it("rejects unknown output formats", () => {
    const result = runStrata([passThroughFixture, "--format", "xml"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--format json|text|sarif");
  });

  it("exposes the packaged bin launcher", () => {
    const result = runPackagedBin(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("strata [PATH]");
  });

  it("rejects unknown flags", () => {
    const result = runStrata(["--wat"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown flag: --wat");
  });
});
