import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cli = join(repoRoot, "src/cli.ts");
const passThroughFixture = join(repoRoot, "test/fixtures/pass-through-method");

function runStrata(args: string[]) {
  return spawnSync("bun", [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
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

  it("rejects unknown flags", () => {
    const result = runStrata(["--wat"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown flag: --wat");
  });
});
