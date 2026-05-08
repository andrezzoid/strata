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
    expect(parsed.findings.some((finding: { flag: string }) => finding.flag === "passThroughMethod")).toBe(true);
  });

  it("prints text output", () => {
    const result = runStrata([passThroughFixture, "--format", "text"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Total:");
    expect(result.stdout).toContain("[passThroughMethod] case.ts:7");
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
