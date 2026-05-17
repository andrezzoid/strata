import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "bun:test";

import type { Ctx } from "../src/ast.ts";
import { main } from "../src/cli.ts";
import { DETECTOR_DEFINITIONS } from "../src/detectors/registry.ts";
import type { ImportResolver } from "../src/scope.ts";
import type { Finding } from "../src/types.ts";

const here = dirname(Bun.fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cli = join(repoRoot, "src/cli.ts");
const bin = join(repoRoot, "bin/strata.js");
const passThroughFixture = join(repoRoot, "test/fixtures/pass-through-method");

type TestDetectorDefinition =
  | { id: string; kind: "single"; description: string; detect: (ctx: Ctx) => Finding[] }
  | {
      id: string;
      kind: "cross";
      description: string;
      detect: (ctxs: Ctx[], imports: ImportResolver) => Finding[];
    };

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

async function readPackageVersion(): Promise<string> {
  const packageJson = (await Bun.file(join(repoRoot, "package.json")).json()) as {
    version: string;
  };
  return packageJson.version;
}

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

async function runStrataInProcess(args: string[]) {
  const originalArgv = process.argv;
  const stdout = process.stdout as unknown as { write(text: unknown): boolean };
  const stderr = process.stderr as unknown as { write(text: unknown): boolean };
  const originalStdoutWrite = stdout.write;
  const originalStderrWrite = stderr.write;
  const processControl = process as unknown as { exit(code?: number): never };
  const originalExit = processControl.exit;
  let status = 0;
  let stdoutText = "";
  let stderrText = "";

  try {
    process.argv = ["bun", cli, ...args];
    stdout.write = (text: unknown) => {
      stdoutText += String(text);
      return true;
    };
    stderr.write = (text: unknown) => {
      stderrText += String(text);
      return true;
    };
    processControl.exit = (code = 0) => {
      throw new ProcessExit(code);
    };

    await main();
  } catch (error) {
    if (!(error instanceof ProcessExit)) throw error;
    status = error.code;
  } finally {
    process.argv = originalArgv;
    stdout.write = originalStdoutWrite;
    stderr.write = originalStderrWrite;
    processControl.exit = originalExit;
  }

  return { status, stdout: stdoutText, stderr: stderrText };
}

async function withDetectorDefinition<T>(
  definition: TestDetectorDefinition,
  run: () => Promise<T>,
): Promise<T> {
  const definitions = DETECTOR_DEFINITIONS as unknown as TestDetectorDefinition[];
  definitions.push(definition);
  try {
    return await run();
  } finally {
    definitions.splice(definitions.lastIndexOf(definition), 1);
  }
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

async function createTouchedPassThroughRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "strata-cli-touched-since-"));
  mkdirSync(join(root, "src"), { recursive: true });
  await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
  await Bun.write(
    join(root, "src", "touched.ts"),
    "export class TouchedService { constructor(private repo: any) {} getTouched(id: string) { return this.repo.getTouched(id); } }\n",
  );
  await Bun.write(
    join(root, "src", "untouched.ts"),
    "export class UntouchedService { constructor(private repo: any) {} getUntouched(id: string) { return this.repo.getUntouched(id); } }\n",
  );
  runGit(root, ["init"]);
  commitAll(root, "base");

  await Bun.write(
    join(root, "src", "touched.ts"),
    "export class TouchedService { constructor(private repo: any) {} getTouched(id: string) { return this.repo.getTouched(id); } }\nexport const touched = true;\n",
  );
  return root;
}

describe("CLI", () => {
  it("prints the package version", async () => {
    const result = runStrata(["--version"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`strata ${await readPackageVersion()}\n`);
    expect(result.stderr).toBe("");
  });

  it("prints the package version before help usage", async () => {
    const result = runStrata(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toStartWith(`strata ${await readPackageVersion()}\nstrata [PATH]`);
    expect(result.stderr).toBe("");
  });

  it("does not accept version aliases", () => {
    const lowerShort = runStrata(["-v"]);
    const upperShort = runStrata(["-V"]);
    const subcommand = runStrata(["version"]);

    expect(lowerShort.status).toBe(2);
    expect(lowerShort.stderr).toContain("unknown flag: -v");
    expect(upperShort.status).toBe(2);
    expect(upperShort.stderr).toContain("unknown flag: -V");
    expect(subcommand.status).toBe(2);
    expect(subcommand.stderr).toContain("no such path: version");
  });

  it("prints text by default", () => {
    const result = runStrata([passThroughFixture]);

    expect(result.status).toBe(0);
    expect(result.stdout).toStartWith(
      `strata complexity candidates\nMode: full scan\nTarget: ${passThroughFixture}\n`,
    );
    expect(result.stdout).toContain("Found 3 review candidates.");
    expect(result.stdout).toContain("candidate signals, not automated design verdicts");
  });

  it("prints JSON when explicitly requested", () => {
    const result = runStrata([passThroughFixture, "--format", "json"]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.summary.totalFindings).toBeGreaterThan(0);
    expect(
      parsed.findings.some((finding: { flag: string }) => finding.flag === "passThroughMethod"),
    ).toBe(true);
  });

  it("prints only requested detector findings", () => {
    const result = runStrata([
      passThroughFixture,
      "--only",
      "passThroughMethod",
      "--format",
      "json",
    ]);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(new Set(parsed.findings.map((finding: { flag: string }) => finding.flag))).toEqual(
      new Set(["passThroughMethod"]),
    );
    expect(parsed.summary.byFlag).toEqual({ passThroughMethod: parsed.summary.totalFindings });
  });

  it("rejects the removed passThroughVariable detector filter", () => {
    const result = runStrata([passThroughFixture, "--only", "passThroughVariable"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown detector: passThroughVariable");
    expect(result.stderr).not.toContain("passThroughVariable, ");
  });

  it("rejects the removed catch-handling detector filters", () => {
    for (const detector of ["emptyCatch", "catchRethrow"]) {
      const result = runStrata([passThroughFixture, "--only", detector]);

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`unknown detector: ${detector}`);
      expect(result.stderr).not.toContain(`${detector}, `);
    }
  });

  it("rejects the removed wideModule detector filter", () => {
    const result = runStrata([passThroughFixture, "--only", "wideModule"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown detector: wideModule");
    expect(result.stderr).not.toContain("wideModule, ");
  });

  it("rejects the removed shallowModule detector filter", () => {
    const result = runStrata([passThroughFixture, "--only", "shallowModule"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown detector: shallowModule");
    expect(result.stderr).not.toContain("shallowModule, ");
  });

  it("rejects the removed genericNaming detector filter", () => {
    const result = runStrata([passThroughFixture, "--only", "genericNaming"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown detector: genericNaming");
    expect(result.stderr).not.toContain("genericNaming, ");
  });

  it("omits excluded detector findings", () => {
    const result = runStrata([
      passThroughFixture,
      "--exclude",
      "passThroughMethod",
      "--format",
      "json",
    ]);

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
    expect(result.stdout).toContain("Found 3 review candidates.");
  });

  it("fails with default text output when requested and findings exist", () => {
    const result = runStrata([passThroughFixture, "--fail-on-findings"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Found 3 review candidates.");
  });

  it("fails with explicit JSON output when requested and findings exist", () => {
    const result = runStrata([passThroughFixture, "--format", "json", "--fail-on-findings"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).summary.totalFindings).toBeGreaterThan(0);
  });

  it("passes with --fail-on-findings when no findings exist", () => {
    const root = mkdtempSync(join(tmpdir(), "strata-cli-empty-"));
    try {
      const result = runStrata([root, "--fail-on-findings"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No review candidates were emitted for this scan.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints text output", () => {
    const result = runStrata([passThroughFixture, "--format", "text"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toStartWith(
      `strata complexity candidates\nMode: full scan\nTarget: ${passThroughFixture}\n`,
    );
    expect(result.stdout).toContain("Found 3 review candidates.");
    expect(result.stdout).toContain("candidate signals, not automated design verdicts");
    expect(result.stdout).toContain("passThroughMethod\n  Suspicious when a method only forwards");
    expect(result.stdout).toContain("  case.ts:7\n    class method delegates");
    expect(result.stdout).toContain(
      "evidence: 2/3 public methods in UserService are pass-through (67%)",
    );
    expect(result.stdout).not.toContain("strata:v1:");
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
    expect(result.stdout).toContain("orphanFile");
  });

  it("prints introduced-only text output with base-ref context", async () => {
    const root = await createIntroducedPassThroughRepo(true);
    try {
      const result = runStrata([
        join(root, "src"),
        "--new-since",
        "HEAD",
        "--only",
        "passThroughMethod",
        "--format",
        "text",
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toStartWith(
        `strata complexity candidates\nMode: introduced candidates\nTarget: ${join(root, "src")}\nBase ref: HEAD\n`,
      );
      expect(result.stdout).toContain("Found 1 review candidate introduced since HEAD.");
      expect(result.stdout).toContain("Inherited");
      expect(result.stdout).toContain("candidates are omitted by fingerprint");
      expect(result.stdout).toContain("new-service.ts:1");
      expect(result.stdout).not.toContain("\n  service.ts:1\n");
      expect(result.stdout).not.toContain("strata:v1:");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints scanner failures as failure reports instead of stack traces", () => {
    const result = runStrata([
      passThroughFixture,
      "--new-since",
      "missing-ref",
      "--format",
      "text",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith(
      `strata scan failed\nMode: introduced candidates\nTarget: ${passThroughFixture}\nBase ref: missing-ref\n`,
    );
    expect(result.stderr).toContain("Reason: invalid git ref: missing-ref");
    expect(result.stderr).toContain("No trustworthy candidate report was produced.");
    expect(result.stderr).not.toContain("Bun v");
    expect(result.stderr).not.toContain(" at ");
  });

  it("keeps JSON stdout empty when scanner failures occur", () => {
    const result = runStrata([
      passThroughFixture,
      "--new-since",
      "missing-ref",
      "--format",
      "json",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith("strata scan failed\nMode: introduced candidates\n");
    expect(result.stderr).toContain("Reason: invalid git ref: missing-ref");
  });

  it("keeps SARIF stdout empty when scanner failures occur", () => {
    const result = runStrata([
      passThroughFixture,
      "--new-since",
      "missing-ref",
      "--format",
      "sarif",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith("strata scan failed\nMode: introduced candidates\n");
    expect(result.stderr).toContain("Reason: invalid git ref: missing-ref");
  });

  it("fails closed when a single-file detector throws", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-cli-single-detector-failure-"));
    try {
      await Bun.write(join(root, "case.ts"), "export const entry = true;\n");

      const result = await withDetectorDefinition(
        {
          id: "throwSingle",
          kind: "single",
          description: "Test-only detector that throws from a file scan.",
          detect() {
            throw new Error("forced single detector failure");
          },
        },
        () => runStrataInProcess([root, "--format", "text"]),
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith(`strata scan failed\nMode: full scan\nTarget: ${root}\n`);
      expect(result.stderr).toContain(
        "Reason: detector throwSingle failed on case.ts: forced single detector failure",
      );
      expect(result.stderr).not.toContain("strata complexity candidates");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when a cross-project detector throws", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-cli-cross-detector-failure-"));
    try {
      await Bun.write(join(root, "case.ts"), "export const entry = true;\n");

      const result = await withDetectorDefinition(
        {
          id: "throwCross",
          kind: "cross",
          description: "Test-only detector that throws from a project scan.",
          detect() {
            throw new Error("forced cross detector failure");
          },
        },
        () => runStrataInProcess([root, "--format", "json"]),
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith(`strata scan failed\nMode: full scan\nTarget: ${root}\n`);
      expect(result.stderr).toContain(
        "Reason: cross-project detector throwCross failed: forced cross detector failure",
      );
      expect(result.stderr).not.toContain('"summary"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    expect(
      sarif.runs[0].tool.driver.rules.some((rule: { id: string }) => rule.id === "shallowModule"),
    ).toBe(false);
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
        "--format",
        "json",
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

  it("prints JSON findings in files touched since a git ref", async () => {
    const root = await createTouchedPassThroughRepo();
    try {
      const result = runStrata([
        join(root, "src"),
        "--touched-since",
        "HEAD",
        "--only",
        "passThroughMethod",
        "--format",
        "json",
      ]);

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(
        parsed.findings.map(
          (finding: { flag: string; file: string }) => `${finding.flag}:${finding.file}`,
        ),
      ).toEqual(["passThroughMethod:touched.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when touched-since ref cannot be resolved", () => {
    const result = runStrata([
      passThroughFixture,
      "--touched-since",
      "missing-ref",
      "--format",
      "text",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toStartWith(
      `strata scan failed\nMode: touched files\nTarget: ${passThroughFixture}\nChanged since: missing-ref\n`,
    );
    expect(result.stderr).toContain("Reason: failed to list files changed since missing-ref");
    expect(result.stderr).not.toContain("No review candidates were emitted");
  });

  it("fails closed for touched-since outside a git worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-cli-touched-non-git-"));
    try {
      await Bun.write(join(root, "index.ts"), "export const entry = true;\n");

      const result = runStrata([root, "--touched-since", "HEAD", "--format", "text"]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith(
        `strata scan failed\nMode: touched files\nTarget: ${root}\nChanged since: HEAD\n`,
      );
      expect(result.stderr).toContain("Reason: failed to list files changed since HEAD");
      expect(result.stderr).not.toContain("No review candidates were emitted");
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
        "--format",
        "json",
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
        "--format",
        "json",
        "--fail-on-findings",
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).summary.totalFindings).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes with --fail-on-findings when filtering removes every finding", () => {
    const result = runStrata([
      passThroughFixture,
      "--only",
      "wideSignature",
      "--format",
      "json",
      "--fail-on-findings",
    ]);

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

  it("rejects missing touched-since refs", () => {
    const result = runStrata([passThroughFixture, "--touched-since"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--touched-since <git-ref>");
  });

  it("rejects combining touched-since and new-since filtering", () => {
    const result = runStrata([
      passThroughFixture,
      "--touched-since",
      "HEAD",
      "--new-since",
      "HEAD",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot combine --touched-since and --new-since");
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

  it("exposes the packaged bin launcher", async () => {
    const result = runPackagedBin(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`strata ${await readPackageVersion()}`);
    expect(result.stdout).toContain("strata [PATH]");
    expect(result.stdout).toContain("--touched-since <git-ref>");
    expect(result.stdout).toContain("--new-since <git-ref>");
    expect(result.stdout).toContain("--only <detectors>");
    expect(result.stdout).toContain("--exclude <detectors>");
  });

  it("prints the package version through the packaged bin launcher", async () => {
    const result = runPackagedBin(["--version"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`strata ${await readPackageVersion()}\n`);
    expect(result.stderr).toBe("");
  });

  it("rejects unknown flags", () => {
    const result = runStrata(["--wat"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown flag: --wat");
  });
});
