import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "bun:test";

import { buildLineOf } from "../src/ast.ts";
import { formatResult } from "../src/format.ts";
import { collectAllProjectFiles, withBaseSnapshotTarget } from "../src/project.ts";
import { scanProject, scanProjectAtGitRef } from "../src/scan.ts";
import { createImportResolver, normalizePath, resolveRelativeImport } from "../src/scope.ts";
import type { ScanResult } from "../src/types.ts";

const here = dirname(Bun.fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "fixtures");

function runGit(cwd: string, args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.success, result.stderr?.toString()).toBe(true);
}

function gitOutput(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.success, result.stderr?.toString()).toBe(true);
  return result.stdout?.toString() ?? "";
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

function worktreePaths(cwd: string): string[] {
  return gitOutput(cwd, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

function passThroughSource(className: string, methodName: string): string {
  return `export class ${className} { repo: any; ${methodName}(id: string) { return this.repo.${methodName}(id); } }\n`;
}

describe("buildLineOf", () => {
  it("maps parser offsets to one-based source lines", () => {
    const lineOf = buildLineOf("first\nsecond\n\nfourth");

    expect(lineOf(0)).toBe(1);
    expect(lineOf(5)).toBe(1);
    expect(lineOf(6)).toBe(2);
    expect(lineOf(13)).toBe(3);
    expect(lineOf(14)).toBe(4);
  });

  it("keeps out-of-range offsets on the nearest representable line", () => {
    const lineOf = buildLineOf("one\ntwo");

    expect(lineOf(-10)).toBe(1);
    expect(lineOf(999)).toBe(2);
  });
});

describe("path and import resolution", () => {
  it("normalizes project-relative paths without letting parent segments escape the root", () => {
    expect(normalizePath("src/./detectors/../format.ts")).toBe("src/format.ts");
    expect(normalizePath("../outside.ts")).toBe("outside.ts");
  });

  it("resolves relative imports against known TS and TSX project files", () => {
    const fileSet = new Set(["src/components/view.ts", "src/model.ts", "src/widgets/index.tsx"]);

    expect(resolveRelativeImport("src/components/view.ts", "../model", fileSet)).toBe(
      "src/model.ts",
    );
    expect(resolveRelativeImport("src/components/view.ts", "../widgets", fileSet)).toBe(
      "src/widgets/index.tsx",
    );
    expect(resolveRelativeImport("src/components/view.ts", "../missing", fileSet)).toBeNull();
  });

  it("resolves root tsconfig paths and baseUrl imports against scanned project files", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-tsconfig-paths-"));
    try {
      await Bun.write(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: "src",
            paths: {
              "@domain": ["domain/index"],
              "@ui/*": ["ui/*"],
              "@outside/*": ["../outside/*"],
            },
          },
        }),
      );

      const resolver = await createImportResolver(
        root,
        new Set(["src/app.ts", "src/domain/index.ts", "src/ui/button.tsx", "src/shared/logger.ts"]),
      );

      expect(resolver.resolve("src/app.ts", "@domain")).toBe("src/domain/index.ts");
      expect(resolver.resolve("src/app.ts", "@ui/button")).toBe("src/ui/button.tsx");
      expect(resolver.resolve("src/app.ts", "shared/logger")).toBe("src/shared/logger.ts");
      expect(resolver.resolve("src/app.ts", "@outside/thing")).toBeNull();
      expect(resolver.resolve("src/app.ts", "react")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("formatResult", () => {
  const result: ScanResult = {
    summary: {
      totalFindings: 1,
      byFlag: { duplicateSymbol: 1 },
      topFiles: [{ file: "src/a.ts", count: 1 }],
    },
    findings: [
      {
        flag: "duplicateSymbol",
        severity: "candidate",
        fingerprint: "strata:v1:duplicate-shape-sample",
        file: "src/a.ts",
        line: 3,
        message: "Duplicate shape",
        metadata: {
          preview: "type Shape = { id: string }",
          previewFrom: "src/a.ts:3",
          occurrences: [{ name: "Shape", file: "src/a.ts", line: 3 }],
        },
      },
    ],
  };

  it("emits deterministic pretty JSON with a trailing newline", () => {
    expect(formatResult(result, "json")).toBe(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("emits a first-class text report with candidate framing and grouped detail", () => {
    const output = formatResult(result, "text", { text: { mode: "full", target: "src" } });

    expect(output).toStartWith("strata complexity candidates\nMode: full scan\nTarget: src\n");
    expect(output).toContain("Found 1 review candidate.");
    expect(output).toContain("candidate signals, not automated design verdicts");
    expect(output).toContain("By detector:\n  duplicateSymbol  1");
    expect(output).toContain("Top files:\n  1  src/a.ts");
    expect(output).toContain(
      "duplicateSymbol\n  Suspicious when declarations share the same structure",
    );
    expect(output).toContain("  src/a.ts:3\n    Duplicate shape");
    expect(output).toContain("    preview (from src/a.ts:3):");
    expect(output).toContain("    occurrences (1):\n      src/a.ts:3  Shape");
    expect(output).not.toContain("strata:v1:duplicate-shape-sample");
    expect(output).not.toContain("severity");
  });

  it("normalizes non-ASCII detector punctuation in text messages", () => {
    const output = formatResult(
      {
        summary: {
          totalFindings: 1,
          byFlag: { duplicateSymbol: 1 },
          topFiles: [{ file: "src/a.ts", count: 1 }],
        },
        findings: [
          {
            flag: "duplicateSymbol",
            severity: "candidate",
            fingerprint: "strata:v1:unicode-sample",
            file: "src/a.ts",
            line: 1,
            message: "const re-declared 2× across files — duplicated shape …",
            metadata: {},
          },
        ],
      },
      "text",
      { text: { mode: "full", target: "src" } },
    );

    expect(output).toContain("const re-declared 2x across files - duplicated shape ...");
    expect(output).not.toContain("×");
    expect(output).not.toContain("—");
    expect(output).not.toContain("…");
  });

  it("emits compact zero-candidate text without empty section shells", () => {
    const output = formatResult(
      { summary: { totalFindings: 0, byFlag: {}, topFiles: [] }, findings: [] },
      "text",
      { text: { mode: "introduced", target: ".", ref: "origin/main" } },
    );

    expect(output).toStartWith(
      "strata complexity candidates\nMode: introduced candidates\nTarget: .\nBase ref: origin/main\n",
    );
    expect(output).toContain("No review candidates were emitted for this scan.");
    expect(output).toContain("not a verdict that the design is clean");
    expect(output).not.toContain("By detector:");
    expect(output).not.toContain("Top files:");
    expect(output).not.toContain("Findings:");
  });

  it("emits GitHub-code-scanning-friendly SARIF", () => {
    const output = formatResult(result, "sarif");
    const sarif = JSON.parse(output);
    const run = sarif.runs[0];
    const duplicateRuleIndex = run.tool.driver.rules.findIndex(
      (rule: { id: string }) => rule.id === "duplicateSymbol",
    );

    expect(sarif.$schema).toBe("https://json.schemastore.org/sarif-2.1.0.json");
    expect(sarif.version).toBe("2.1.0");
    expect(run.tool.driver.name).toBe("strata");
    expect(duplicateRuleIndex).toBeGreaterThanOrEqual(0);
    expect(run.results).toEqual([
      {
        ruleId: "duplicateSymbol",
        ruleIndex: duplicateRuleIndex,
        level: "warning",
        message: { text: "Duplicate shape" },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: "src/a.ts" },
              region: { startLine: 3 },
            },
          },
        ],
        partialFingerprints: {
          primaryLocationLineHash: "strata:v1:duplicate-shape-sample",
        },
      },
    ]);
  });

  it("shows how often a forcedRareOption value repeats and lists at most 5 of its call sites", () => {
    const callSites = Array.from({ length: 7 }, (_, index) => ({
      file: `src/caller-${index + 1}.ts`,
      line: index + 10,
    }));
    const output = formatResult(
      {
        summary: { totalFindings: 1, byFlag: { forcedRareOption: 1 }, topFiles: [] },
        findings: [
          {
            flag: "forcedRareOption",
            severity: "candidate",
            fingerprint: "strata:v1:forced-rare-option-sample",
            file: "src/api.ts",
            line: 1,
            message: "send callers pass true for 'retry' in 7/8 calls",
            metadata: {
              kind: "parameter",
              value: "true",
              repeatedCount: 7,
              callCount: 8,
              callSites,
            },
          },
        ],
      },
      "text",
    );

    expect(output).toContain(
      [
        "  src/api.ts:1",
        "    send callers pass true for 'retry' in 7/8 calls",
        "    evidence: 7/8 calls pass true",
        "    call sites (7):",
        "      src/caller-1.ts:10",
        "      src/caller-2.ts:11",
        "      src/caller-3.ts:12",
        "      src/caller-4.ts:13",
        "      src/caller-5.ts:14",
        "      ... 2 more",
      ].join("\n"),
    );
    expect(output).not.toContain("src/caller-6.ts");
  });

  it("keeps the SARIF rule order, so result ruleIndex values stay stable", () => {
    const output = formatResult(
      { summary: { totalFindings: 0, byFlag: {}, topFiles: [] }, findings: [] },
      "sarif",
    );
    const ruleIds = JSON.parse(output).runs[0].tool.driver.rules.map(
      (rule: { id: string }) => rule.id,
    );

    expect(ruleIds).toEqual([
      "wideSignature",
      "passThroughMethod",
      "passThroughExport",
      "exposedMutableRepresentation",
      "forcedRareOption",
      "duplicateSymbol",
      "uniqueImplementation",
    ]);
  });

  it("describes the current wideSignature behaviour in its SARIF rule", () => {
    const output = formatResult(
      { summary: { totalFindings: 0, byFlag: {}, topFiles: [] }, findings: [] },
      "sarif",
    );
    const descriptor = JSON.parse(output).runs[0].tool.driver.rules.find(
      (rule: { id: string }) => rule.id === "wideSignature",
    );

    const current =
      "Exported function or public exported-class member has too many required parameters.";
    expect(descriptor.shortDescription.text).toBe(current);
    expect(descriptor.fullDescription.text).toBe(current);
  });

  it("always emits the stable exposedMutableRepresentation SARIF rule", () => {
    const output = formatResult(
      { summary: { totalFindings: 0, byFlag: {}, topFiles: [] }, findings: [] },
      "sarif",
    );
    const sarif = JSON.parse(output);
    const descriptor = sarif.runs[0].tool.driver.rules.find(
      (rule: { id: string }) => rule.id === "exposedMutableRepresentation",
    );

    expect(descriptor).toEqual({
      id: "exposedMutableRepresentation",
      name: "Exposed mutable representation",
      shortDescription: {
        text: "Exported class returns an exact private mutable field through a public member.",
      },
      fullDescription: {
        text: "Exported class returns an exact private mutable field through a public member.",
      },
      defaultConfiguration: { level: "warning" },
      help: {
        text: "Exported class returns an exact private mutable field through a public member. Strata reports this as a candidate for human or AI review, not as an automatic verdict.",
      },
      properties: {
        tags: ["maintainability", "posd"],
        precision: "medium",
        "problem.severity": "recommendation",
      },
    });
  });
});

describe("forcedRareOption option evidence", () => {
  it("shows how often an option value repeats and where, in the text report", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-forced-rare-option-evidence-"));
    try {
      await Bun.write(
        join(root, "api.ts"),
        [
          "export type SendOptions = { to: string; body: string; retries: number; mode: string; trace: boolean };",
          "export function send(options: SendOptions) { return options; }",
          "",
        ].join("\n"),
      );
      const call = (to: string) =>
        `send({ to: "${to}", body: "x", retries: 3, mode: "fast", trace: false });`;
      await Bun.write(
        join(root, "a.ts"),
        `import { send } from "./api";\n${call("a")}\n${call("b")}\n`,
      );
      await Bun.write(join(root, "b.ts"), `import { send } from "./api";\n${call("c")}\n`);

      const result = await scanProject({
        target: root,
        detectorSelection: { kind: "only", ids: ["forcedRareOption"] },
      });
      const option = result.findings.find((finding) => finding.metadata.optionName === "mode");
      expect(option?.metadata.kind).toBe("option");

      const text = formatResult({ ...result, findings: option ? [option] : [] }, "text");
      expect(text).toContain(
        [
          "  api.ts:2",
          "    send callers pass \"fast\" for option 'mode' in 3/3 calls - the option is probably a default",
          '    evidence: 3/3 calls pass "fast"',
          "    call sites (3):",
          "      a.ts:2",
          "      a.ts:3",
          "      b.ts:2",
        ].join("\n"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scanProject summary topFiles", () => {
  function byFile(topFiles: Array<{ file: string; count: number }>) {
    return [...topFiles].sort((a, b) => a.file.localeCompare(b.file));
  }

  it("counts a duplicate-symbol finding once per file, however many occurrences it holds", async () => {
    const result = await scanProject({
      target: join(fixturesRoot, "duplicate-symbol-within-file"),
    });

    expect(result.findings).toHaveLength(2);
    expect(result.summary.topFiles).toEqual([{ file: "case.ts", count: 2 }]);
  });

  it("counts implementer files alongside the abstraction that anchors the finding", async () => {
    const result = await scanProject({ target: join(fixturesRoot, "unique-implementation") });

    expect(byFile(result.summary.topFiles)).toEqual([
      { file: "contracts.ts", count: 2 },
      { file: "forum/moderator.ts", count: 1 },
      { file: "forum/types.ts", count: 1 },
      { file: "impls.ts", count: 1 },
      { file: "payments/processor.ts", count: 1 },
      { file: "payments/types.ts", count: 1 },
    ]);
  });
});

describe("collectAllProjectFiles", () => {
  it("returns sorted TS/TSX project files while excluding dependency and VCS directories", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-core-files-"));
    try {
      mkdirSync(join(root, "src", "nested"), { recursive: true });
      mkdirSync(join(root, "src", "node_modules"), { recursive: true });
      mkdirSync(join(root, "node_modules"), { recursive: true });
      mkdirSync(join(root, ".git"), { recursive: true });

      await Bun.write(join(root, "root.ts"), "export const root = true;");
      await Bun.write(join(root, "component.tsx"), "export const Component = () => null;");
      await Bun.write(join(root, "src", "feature.ts"), "export const feature = true;");
      await Bun.write(join(root, "src", "nested", "view.tsx"), "export const View = () => null;");
      await Bun.write(join(root, "src", "note.js"), "export const ignored = true;");
      await Bun.write(
        join(root, "src", "node_modules", "ignored.ts"),
        "export const ignored = true;",
      );
      await Bun.write(join(root, "node_modules", "ignored.ts"), "export const ignored = true;");
      await Bun.write(join(root, ".git", "ignored.ts"), "export const ignored = true;");

      expect(collectAllProjectFiles(root)).toEqual([
        "component.tsx",
        "root.ts",
        "src/feature.ts",
        "src/nested/view.tsx",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scanProject import graph resolution", () => {
  it("uses scan-root tsconfig aliases for declaration-site analysis", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-scan-aliases-"));
    try {
      mkdirSync(join(root, "src", "impl"), { recursive: true });
      await Bun.write(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: "src",
            paths: {
              "@contracts": ["contracts"],
              "@impl/*": ["impl/*"],
            },
          },
        }),
      );
      await Bun.write(
        join(root, "src", "index.ts"),
        "import { Adapter } from '@impl/adapter'; export const adapter = new Adapter();",
      );
      await Bun.write(
        join(root, "src", "contracts.ts"),
        "export interface Port { send(value: string): void; }",
      );
      await Bun.write(
        join(root, "src", "impl", "adapter.ts"),
        "import { Port } from '@contracts'; export class Adapter implements Port { send(value: string) {} }",
      );

      const result = await scanProject({ target: root });

      expect(
        result.findings
          .filter((finding) => finding.flag === "uniqueImplementation")
          .map((finding) => finding.metadata.name),
      ).toEqual(["Port"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scanProject base snapshots", () => {
  it("scans the base ref target while current scans keep staged, unstaged, and untracked files", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-base-scan-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
      await Bun.write(join(root, "src", "base-only.ts"), passThroughSource("BaseOnly", "getBase"));
      runGit(root, ["init"]);
      commitAll(root, "base");

      await Bun.write(
        join(root, "src", "staged-only.ts"),
        passThroughSource("StagedOnly", "getStaged"),
      );
      runGit(root, ["add", "src/staged-only.ts"]);
      await Bun.write(
        join(root, "src", "unstaged-only.ts"),
        passThroughSource("UnstagedOnly", "getUnstaged"),
      );
      await Bun.write(
        join(root, "src", "untracked-only.ts"),
        passThroughSource("UntrackedOnly", "getUntracked"),
      );

      const current = await scanProject({
        target: join(root, "src"),
        detectorSelection: { kind: "only", ids: ["passThroughMethod"] },
      });
      const beforeWorktrees = worktreePaths(root);
      const base = await scanProjectAtGitRef({
        target: join(root, "src"),
        ref: "HEAD",
        detectorSelection: { kind: "only", ids: ["passThroughMethod"] },
      });

      expect(current.findings.map((finding) => finding.file).sort()).toEqual([
        "base-only.ts",
        "staged-only.ts",
        "unstaged-only.ts",
        "untracked-only.ts",
      ]);
      expect(base.findings.map((finding) => finding.file)).toEqual(["base-only.ts"]);
      expect(worktreePaths(root)).toEqual(beforeWorktrees);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats targets missing at the base ref as an empty base scan", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-base-missing-target-"));
    try {
      await Bun.write(join(root, "index.ts"), "export const entry = true;\n");
      runGit(root, ["init"]);
      commitAll(root, "base");
      mkdirSync(join(root, "new-src"), { recursive: true });
      await Bun.write(join(root, "new-src", "new-file.ts"), passThroughSource("NewFile", "getNew"));

      const result = await scanProjectAtGitRef({
        target: join(root, "new-src"),
        ref: "HEAD",
        detectorSelection: { kind: "only", ids: ["passThroughMethod"] },
      });

      expect(result).toEqual({
        summary: { totalFindings: 0, byFlag: {}, topFiles: [] },
        findings: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails clearly for invalid refs and non-git targets", async () => {
    const gitRoot = mkdtempSync(join(tmpdir(), "strata-base-invalid-ref-"));
    const nonGitRoot = mkdtempSync(join(tmpdir(), "strata-base-non-git-"));
    try {
      await Bun.write(join(gitRoot, "index.ts"), "export const entry = true;\n");
      runGit(gitRoot, ["init"]);
      commitAll(gitRoot, "base");
      await Bun.write(join(nonGitRoot, "index.ts"), "export const entry = true;\n");

      await expect(scanProjectAtGitRef({ target: gitRoot, ref: "missing-ref" })).rejects.toThrow(
        "invalid git ref: missing-ref",
      );
      await expect(scanProjectAtGitRef({ target: nonGitRoot, ref: "HEAD" })).rejects.toThrow(
        "target is not inside a git worktree",
      );
    } finally {
      rmSync(gitRoot, { recursive: true, force: true });
      rmSync(nonGitRoot, { recursive: true, force: true });
    }
  });

  it("cleans temporary worktrees when snapshot work fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-base-cleanup-"));
    try {
      await Bun.write(join(root, "index.ts"), "export const entry = true;\n");
      runGit(root, ["init"]);
      commitAll(root, "base");
      const beforeWorktrees = worktreePaths(root);

      await expect(
        withBaseSnapshotTarget(root, "HEAD", async () => {
          throw new Error("forced snapshot failure");
        }),
      ).rejects.toThrow("forced snapshot failure");

      expect(worktreePaths(root)).toEqual(beforeWorktrees);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scanProject introduced-only filtering", () => {
  it("emits only selected current findings whose fingerprints are absent from the base scan", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-new-since-single-"));
    try {
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
      await Bun.write(
        join(root, "src", "new-service.ts"),
        "export class ProjectService { constructor(private repo: any) {} getProject(id: string) { return this.repo.getProject(id); } }\n",
      );

      const result = await scanProject({
        target: join(root, "src"),
        newSinceRef: "HEAD",
        detectorSelection: { kind: "only", ids: ["passThroughMethod"] },
      });

      expect(result.findings.map((finding) => `${finding.flag}:${finding.file}`)).toEqual([
        "passThroughMethod:new-service.ts",
      ]);
      expect(result.summary).toEqual({
        totalFindings: 1,
        byFlag: { passThroughMethod: 1 },
        topFiles: [{ file: "new-service.ts", count: 1 }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits cross-file findings introduced by full-project graph changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-new-since-cross-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
      await Bun.write(
        join(root, "src", "contracts.ts"),
        "export interface Port { send(value: string): void; }\n",
      );
      await Bun.write(
        join(root, "src", "adapter-a.ts"),
        "import { Port } from './contracts'; export class AdapterA implements Port { send(value: string) {} }\n",
      );
      await Bun.write(
        join(root, "src", "adapter-b.ts"),
        "import { Port } from './contracts'; export class AdapterB implements Port { send(value: string) {} }\n",
      );
      runGit(root, ["init"]);
      commitAll(root, "base");

      rmSync(join(root, "src", "adapter-b.ts"));

      const result = await scanProject({
        target: join(root, "src"),
        newSinceRef: "HEAD",
        detectorSelection: { kind: "only", ids: ["uniqueImplementation"] },
      });

      expect(result.findings.map((finding) => `${finding.flag}:${finding.file}`)).toEqual([
        "uniqueImplementation:contracts.ts",
      ]);
      expect(result.findings[0].metadata).toMatchObject({
        name: "Port",
        implementerCount: 1,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rebuilds summaries with duplicate-symbol occurrence counts after filtering", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-new-since-duplicates-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
      runGit(root, ["init"]);
      commitAll(root, "base");

      const shape = "export type Shape = { id: string; name: string };\n";
      await Bun.write(join(root, "src", "shape-a.ts"), shape);
      await Bun.write(join(root, "src", "shape-b.ts"), shape);
      await Bun.write(join(root, "src", "shape-c.ts"), shape);

      const result = await scanProject({
        target: join(root, "src"),
        newSinceRef: "HEAD",
        detectorSelection: { kind: "only", ids: ["duplicateSymbol"] },
      });

      expect(result.summary).toEqual({
        totalFindings: 1,
        byFlag: { duplicateSymbol: 1 },
        topFiles: [
          { file: "shape-a.ts", count: 1 },
          { file: "shape-b.ts", count: 1 },
          { file: "shape-c.ts", count: 1 },
        ],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scanProject detector selection", () => {
  const exposedMutableRepresentationFixture = join(fixturesRoot, "exposed-mutable-representation");
  const passThroughFixture = join(fixturesRoot, "pass-through-method");
  const uniqueImplementationFixture = join(fixturesRoot, "unique-implementation");

  it("runs exposedMutableRepresentation in default scans", async () => {
    const result = await scanProject({ target: exposedMutableRepresentationFixture });

    expect(result.findings.map((finding) => finding.flag)).toEqual([
      "exposedMutableRepresentation",
    ]);
  });

  it("selects only exposedMutableRepresentation", async () => {
    const result = await scanProject({
      target: exposedMutableRepresentationFixture,
      detectorSelection: { kind: "only", ids: ["exposedMutableRepresentation"] },
    });

    expect(result.findings.map((finding) => finding.flag)).toEqual([
      "exposedMutableRepresentation",
    ]);
    expect(result.summary.byFlag).toEqual({ exposedMutableRepresentation: 1 });
  });

  it("excludes exposedMutableRepresentation", async () => {
    const result = await scanProject({
      target: exposedMutableRepresentationFixture,
      detectorSelection: { kind: "exclude", ids: ["exposedMutableRepresentation"] },
    });

    expect(result.findings.some((finding) => finding.flag === "exposedMutableRepresentation")).toBe(
      false,
    );
    expect(result.summary.totalFindings).toBe(0);
  });

  it("runs every detector when no detector selection is provided", async () => {
    const result = await scanProject({ target: passThroughFixture });

    expect(result.findings.some((finding) => finding.flag === "passThroughMethod")).toBe(true);
    expect(new Set(result.findings.map((finding) => finding.flag))).toEqual(
      new Set(["passThroughMethod"]),
    );
  });

  it("runs only requested detectors", async () => {
    const result = await scanProject({
      target: passThroughFixture,
      detectorSelection: { kind: "only", ids: ["passThroughMethod"] },
    });

    expect(new Set(result.findings.map((finding) => finding.flag))).toEqual(
      new Set(["passThroughMethod"]),
    );
    expect(result.summary.byFlag).toEqual({ passThroughMethod: result.summary.totalFindings });
  });

  it("omits excluded detectors", async () => {
    const result = await scanProject({
      target: passThroughFixture,
      detectorSelection: { kind: "exclude", ids: ["passThroughMethod"] },
    });

    expect(result.findings.some((finding) => finding.flag === "passThroughMethod")).toBe(false);
    expect(result.summary.totalFindings).toBe(0);
  });

  it("can select cross-project detectors", async () => {
    const result = await scanProject({
      target: uniqueImplementationFixture,
      detectorSelection: { kind: "only", ids: ["uniqueImplementation"] },
    });

    expect(result.findings.some((finding) => finding.flag === "uniqueImplementation")).toBe(true);
    expect(new Set(result.findings.map((finding) => finding.flag))).toEqual(
      new Set(["uniqueImplementation"]),
    );
  });

  it("filters selected cross-project findings after touched-file collection", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-selection-diff-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
      await Bun.write(
        join(root, "src", "copy-a.ts"),
        "export const API_URL = 'https://api.example';\n",
      );
      await Bun.write(
        join(root, "src", "copy-b.ts"),
        "export const API_URL = 'https://api.example';\n",
      );

      runGit(root, ["init"]);
      runGit(root, ["add", "."]);
      runGit(root, [
        "-c",
        "user.name=strata-test",
        "-c",
        "user.email=strata-test@example.com",
        "commit",
        "-m",
        "base",
      ]);
      await Bun.write(
        join(root, "src", "copy-b.ts"),
        "export const API_URL = 'https://api.example';\nexport const touched = true;\n",
      );

      const result = await scanProject({
        target: root,
        touchedSinceRef: "HEAD",
        detectorSelection: { kind: "only", ids: ["duplicateSymbol"] },
      });

      expect(result.findings.map((finding) => `${finding.flag}:${finding.file}`)).toEqual([
        "duplicateSymbol:src/copy-a.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
