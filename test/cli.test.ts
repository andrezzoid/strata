import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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

function runGit(cwd: string, args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.success, result.stderr?.toString()).toBe(true);
}

function commitAll(cwd: string, message: string): void {
  runGit(cwd, ["add", "."]);
  runGit(cwd, [
    "-c",
    "user.name=strata-test",
    "-c",
    "user.email=strata-test@example.com",
    "commit",
    "-m",
    message,
  ]);
}

async function createIntroducedPassThroughRepo(addIntroducedFinding: boolean): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "strata-cli-new-since-"));
  mkdirSync(join(root, "src"), { recursive: true });
  await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
  await Bun.write(
    join(root, "src", "service.ts"),
    "export class UserService { constructor(private repo: any) {} getUser(id: string) { return this.repo.getUser(id); } }\n",
  );
  runGit(root, ["init"]);
  commitAll(root, "base");

  await Bun.write(
    join(root, "src", "service.ts"),
    "export class UserService { constructor(private repo: any) {} getUser(id: string) { return this.repo.getUser(id); } }\nexport const touched = true;\n",
  );
  if (addIntroducedFinding) {
    await Bun.write(
      join(root, "src", "new-service.ts"),
      "export class ProjectService { constructor(private repo: any) {} getProject(id: string) { return this.repo.getProject(id); } }\n",
    );
  }
  return root;
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

  it("prints only requested detector findings", () => {
    const result = runStrata([passThroughFixture, "--only", "passThroughMethod"]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(new Set(parsed.findings.map((finding: { flag: string }) => finding.flag))).toEqual(
      new Set(["passThroughMethod"]),
    );
    expect(parsed.summary.byFlag).toEqual({ passThroughMethod: parsed.summary.totalFindings });
  });

  it("omits excluded detector findings", () => {
    const result = runStrata([passThroughFixture, "--exclude", "passThroughMethod"]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(
      parsed.findings.some((finding: { flag: string }) => finding.flag === "passThroughMethod"),
    ).toBe(false);
    expect(parsed.findings.some((finding: { flag: string }) => finding.flag === "orphanFile")).toBe(
      true,
    );
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

  it("prints text output after detector filtering", () => {
    const result = runStrata([
      passThroughFixture,
      "--exclude",
      "passThroughMethod",
      "--format",
      "text",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("[passThroughMethod]");
    expect(result.stdout).toContain("[orphanFile]");
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

  it("prints filtered SARIF and fails based on the filtered result", () => {
    const result = runStrata([
      passThroughFixture,
      "--only",
      "orphanFile",
      "--format",
      "sarif",
      "--fail-on-findings",
    ]);

    expect(result.status).toBe(1);
    const sarif = JSON.parse(result.stdout);
    expect(
      new Set(sarif.runs[0].results.map((finding: { ruleId: string }) => finding.ruleId)),
    ).toEqual(new Set(["orphanFile"]));
  });

  it("prints JSON introduced since a git ref", async () => {
    const root = await createIntroducedPassThroughRepo(true);
    try {
      const result = runStrata([
        join(root, "src"),
        "--new-since",
        "HEAD",
        "--only",
        "passThroughMethod",
      ]);

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(
        parsed.findings.map(
          (finding: { flag: string; file: string }) => `${finding.flag}:${finding.file}`,
        ),
      ).toEqual(["passThroughMethod:new-service.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints SARIF introduced since a git ref", async () => {
    const root = await createIntroducedPassThroughRepo(true);
    try {
      const result = runStrata([
        join(root, "src"),
        "--new-since",
        "HEAD",
        "--only",
        "passThroughMethod",
        "--format",
        "sarif",
      ]);

      expect(result.status).toBe(0);
      const sarif = JSON.parse(result.stdout);
      expect(
        sarif.runs[0].results.map(
          (finding: {
            ruleId: string;
            locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
          }) => `${finding.ruleId}:${finding.locations[0].physicalLocation.artifactLocation.uri}`,
        ),
      ).toEqual(["passThroughMethod:new-service.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on findings after introduced-only filtering", async () => {
    const root = await createIntroducedPassThroughRepo(true);
    try {
      const result = runStrata([
        join(root, "src"),
        "--new-since",
        "HEAD",
        "--only",
        "passThroughMethod",
        "--fail-on-findings",
      ]);

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).summary.totalFindings).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes fail-on-findings when introduced-only filtering removes inherited findings", async () => {
    const root = await createIntroducedPassThroughRepo(false);
    try {
      const result = runStrata([
        join(root, "src"),
        "--new-since",
        "HEAD",
        "--only",
        "passThroughMethod",
        "--fail-on-findings",
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).summary.totalFindings).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes with --fail-on-findings when filtering removes every finding", () => {
    const result = runStrata([passThroughFixture, "--only", "wideSignature", "--fail-on-findings"]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).summary.totalFindings).toBe(0);
  });

  it("rejects unknown output formats", () => {
    const result = runStrata([passThroughFixture, "--format", "xml"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--format json|text|sarif");
  });

  it("rejects missing new-since refs", () => {
    const result = runStrata([passThroughFixture, "--new-since"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--new-since <git-ref>");
  });

  it("rejects combining diff and new-since filtering", () => {
    const result = runStrata([passThroughFixture, "--diff", "HEAD", "--new-since", "HEAD"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot combine --diff and --new-since");
  });

  it("rejects unknown detector names", () => {
    const result = runStrata([passThroughFixture, "--only", "nope"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown detector: nope");
    expect(result.stderr).toContain("valid detectors:");
    expect(result.stderr).toContain("passThroughMethod");
  });

  it("rejects missing detector lists", () => {
    const result = runStrata([passThroughFixture, "--only"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--only requires a comma-separated detector list");
  });

  it("rejects empty detector list entries", () => {
    const result = runStrata([passThroughFixture, "--exclude", "orphanFile,"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("empty detector in --exclude list");
  });

  it("rejects combining only and exclude detector filters", () => {
    const result = runStrata([
      passThroughFixture,
      "--only",
      "passThroughMethod",
      "--exclude",
      "orphanFile",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot combine --only and --exclude");
  });

  it("exposes the packaged bin launcher", () => {
    const result = runPackagedBin(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("strata [PATH]");
    expect(result.stdout).toContain("--new-since <git-ref>");
    expect(result.stdout).toContain("--only <detectors>");
    expect(result.stdout).toContain("--exclude <detectors>");
  });

  it("rejects unknown flags", () => {
    const result = runStrata(["--wat"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown flag: --wat");
  });
});
