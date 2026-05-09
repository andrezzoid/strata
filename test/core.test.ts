import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "bun:test";

import { buildLineOf } from "../src/ast.ts";
import { formatResult } from "../src/format.ts";
import { collectAllProjectFiles, findingTouchesChanged } from "../src/project.ts";
import { scanProject } from "../src/scan.ts";
import { createImportResolver, normalizePath, resolveRelativeImport } from "../src/scope.ts";
import type { Finding, ScanResult } from "../src/types.ts";

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

describe("findingTouchesChanged", () => {
  const finding: Finding = {
    flag: "uniqueImplementation",
    severity: "candidate",
    fingerprint: "strata:v1:changed-file-sample",
    file: "src/main.ts",
    line: 12,
    message: "candidate",
    metadata: {
      occurrences: [{ file: "src/related.ts" }],
      implementers: [{ file: "src/impl.ts" }],
    },
  };

  it("keeps findings anchored in changed files or changed metadata locations", () => {
    expect(findingTouchesChanged(finding, new Set(["src/main.ts"]))).toBe(true);
    expect(findingTouchesChanged(finding, new Set(["src/related.ts"]))).toBe(true);
    expect(findingTouchesChanged(finding, new Set(["src/impl.ts"]))).toBe(true);
  });

  it("drops findings with no changed anchor", () => {
    expect(findingTouchesChanged(finding, new Set(["src/other.ts"]))).toBe(false);
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
          previewFrom: "src/a.ts",
          occurrences: [{ name: "Shape", file: "src/a.ts", line: 3 }],
        },
      },
    ],
  };

  it("emits deterministic pretty JSON with a trailing newline", () => {
    expect(formatResult(result, "json")).toBe(`${JSON.stringify(result, null, 2)}\n`);
  });

  it("emits text summaries and duplicate-symbol detail blocks", () => {
    const output = formatResult(result, "text");

    expect(output).toContain("Total: 1 findings");
    expect(output).toContain("  duplicateSymbol: 1");
    expect(output).toContain("  1  src/a.ts");
    expect(output).toContain("  [duplicateSymbol] src/a.ts:3 — Duplicate shape");
    expect(output).toContain("      preview (from src/a.ts):");
    expect(output).toContain("      occurrences (1):");
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
  it("uses scan-root tsconfig aliases for orphan and declaration-site analysis", async () => {
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
      await Bun.write(join(root, "src", "unused.ts"), "export const unused = true;");

      const result = await scanProject({ target: root });

      expect(
        result.findings
          .filter((finding) => finding.flag === "orphanFile")
          .map((finding) => finding.file),
      ).toEqual(["src/unused.ts"]);
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

describe("scanProject detector selection", () => {
  const passThroughFixture = join(fixturesRoot, "pass-through-method");
  const uniqueImplementationFixture = join(fixturesRoot, "unique-implementation");

  it("runs every detector when no detector selection is provided", async () => {
    const result = await scanProject({ target: passThroughFixture });

    expect(result.findings.some((finding) => finding.flag === "passThroughMethod")).toBe(true);
    expect(result.findings.some((finding) => finding.flag === "orphanFile")).toBe(true);
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
    expect(result.findings.some((finding) => finding.flag === "orphanFile")).toBe(true);
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

  it("filters selected cross-project findings after diff collection", async () => {
    const root = mkdtempSync(join(tmpdir(), "strata-selection-diff-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      await Bun.write(join(root, "src", "index.ts"), "export const entry = true;\n");
      await Bun.write(join(root, "src", "orphan-a.ts"), "export const a = true;\n");
      await Bun.write(join(root, "src", "orphan-b.ts"), "export const b = true;\n");

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
      await Bun.write(join(root, "src", "orphan-b.ts"), "export const b = false;\n");

      const result = await scanProject({
        target: root,
        diffRef: "HEAD",
        detectorSelection: { kind: "only", ids: ["orphanFile"] },
      });

      expect(result.findings.map((finding) => `${finding.flag}:${finding.file}`)).toEqual([
        "orphanFile:src/orphan-b.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
