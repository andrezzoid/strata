import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "bun:test";

import {
  DETECTOR_DEFINITIONS,
  DETECTOR_IDS,
  findingEvidence,
  findingFiles,
  type DetectorDefinition,
} from "../src/detectors/registry.ts";
import { scanProject } from "../src/scan.ts";
import type { Finding } from "../src/types.ts";

const repoRoot = join(dirname(Bun.fileURLToPath(import.meta.url)), "..");

function finding(flag: string, file: string, metadata: Record<string, unknown>): Finding {
  return {
    flag,
    severity: "candidate",
    fingerprint: `strata:v1:${flag}-sample`,
    file,
    line: 1,
    message: "candidate",
    metadata,
  };
}

describe("findingFiles", () => {
  it("lists the anchor first, then the detector's related files, without repeats", () => {
    const duplicate = finding("duplicateSymbol", "src/a.ts", {
      occurrences: [
        { name: "A", file: "src/a.ts", line: 1 },
        { name: "B", file: "src/b.ts", line: 4 },
        { name: "C", file: "src/b.ts", line: 9 },
      ],
    });
    expect(findingFiles(duplicate)).toEqual(["src/a.ts", "src/b.ts"]);

    const unique = finding("uniqueImplementation", "src/port.ts", {
      implementers: [{ name: "Adapter", file: "src/adapter.ts", line: 3 }],
    });
    expect(findingFiles(unique)).toEqual(["src/port.ts", "src/adapter.ts"]);
  });

  it("involves the call sites that repeat a forcedRareOption value", () => {
    const parameter = finding("forcedRareOption", "api.ts", {
      kind: "parameter",
      callSites: [
        { file: "a.ts", line: 2 },
        { file: "a.ts", line: 3 },
        { file: "b.ts", line: 2 },
      ],
    });
    expect(findingFiles(parameter)).toEqual(["api.ts", "a.ts", "b.ts"]);
  });

  it("keeps placeholder-argument findings to their call-site anchor", () => {
    const placeholder = finding("forcedRareOption", "caller.ts", {
      kind: "placeholderArgs",
      declaration: { file: "api.ts", line: 1 },
      placeholderPositions: [1, 2],
    });
    expect(findingFiles(placeholder)).toEqual(["caller.ts"]);
  });

  it("keeps single-file findings to their anchor, whatever their metadata holds", () => {
    const wide = finding("wideSignature", "src/wide.ts", {
      requiredParams: 5,
      occurrences: [{ file: "src/elsewhere.ts" }],
    });
    expect(findingFiles(wide)).toEqual(["src/wide.ts"]);
  });

  it("falls back to the anchor for unknown flags", () => {
    const unknown = finding("notADetector", "src/x.ts", { occurrences: [{ file: "src/y.ts" }] });
    expect(findingFiles(unknown)).toEqual(["src/x.ts"]);
  });
});

describe("findingEvidence", () => {
  it("has no evidence for unknown flags", () => {
    expect(findingEvidence(finding("notADetector", "src/x.ts", { requiredParams: 5 }))).toEqual([]);
  });
});

describe("shared modules", () => {
  // Scan core, scope filtering, text formatting and SARIF output. Detector-specific
  // metadata keys are only reachable through `finding.metadata`, so a module that
  // never mentions `metadata` cannot depend on one.
  const sharedModules = ["src/scan.ts", "src/project.ts", "src/format.ts", "src/sarif.ts"];

  for (const module of sharedModules) {
    it(`${module} names no detector id and reads no finding metadata`, async () => {
      const source = await Bun.file(join(repoRoot, module)).text();
      const named = DETECTOR_IDS.filter((id) => source.includes(id));
      expect(named).toEqual([]);
      const metadataReads = source.split("\n").filter((line) => /\bmetadata\b/.test(line));
      expect(metadataReads).toEqual([]);
    });
  }
});

describe("DetectorDefinition", () => {
  // `bun run typecheck` checks these cases, not the test runner: each expected
  // error becomes an "unused directive" error once its hook stops being required.
  const descriptor = {
    id: "sample",
    name: "Sample",
    summary: "Sample summary.",
    description: "Sample description.",
  };
  const detectNothing = () => [];

  it("requires every hook", () => {
    // @ts-expect-error a definition must declare its text evidence
    const noEvidence: DetectorDefinition = { ...descriptor, kind: "single", detect: detectNothing };
    // @ts-expect-error a cross-file definition must declare the files its findings involve
    const noRelatedFiles: DetectorDefinition = {
      ...descriptor,
      kind: "cross",
      detect: detectNothing,
      evidence: () => [],
    };
    // @ts-expect-error a single-file definition's findings involve only their anchor
    const singleWithRelatedFiles: DetectorDefinition = {
      ...descriptor,
      kind: "single",
      detect: detectNothing,
      evidence: () => [],
      relatedFiles: () => [],
    };
    const { name: _name, ...nameless } = descriptor;
    // @ts-expect-error a definition must declare its display name
    const noName: DetectorDefinition = {
      ...nameless,
      kind: "single",
      detect: detectNothing,
      evidence: () => [],
    };
    const { summary: _summary, ...summaryless } = descriptor;
    // @ts-expect-error a definition must declare its summary
    const noSummary: DetectorDefinition = {
      ...summaryless,
      kind: "single",
      detect: detectNothing,
      evidence: () => [],
    };
    expect([noEvidence, noRelatedFiles, singleWithRelatedFiles, noName, noSummary]).toHaveLength(5);
  });
});

describe("emitted findings", () => {
  it("carry only registered detector ids as their flag", async () => {
    const result = await scanProject({ target: join(repoRoot, "test/fixtures") });
    expect(result.findings.length).toBeGreaterThan(0);

    const registered = new Set<string>(DETECTOR_IDS);
    const unregistered = result.findings
      .filter((finding) => !registered.has(finding.flag))
      .map((finding) => `${finding.flag} at ${finding.file}:${finding.line}`);
    expect(unregistered).toEqual([]);
  });
});

describe("detector docs", () => {
  type ReadmeRow = { id: string; page: string; scope: string; summary: string };

  // Rows of the README "## Detectors" table: | [`id`](docs/detectors/page.md) | scope | summary |
  async function readmeRows(): Promise<ReadmeRow[]> {
    const readme = await Bun.file(join(repoRoot, "README.md")).text();
    const table = readme.split("\n## Detectors\n")[1]?.split("\n## ")[0] ?? "";
    const rows: ReadmeRow[] = [];
    for (const line of table.split("\n")) {
      const match = /^\|\s*\[`([^`]+)`\]\(([^)]+)\)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|$/.exec(line);
      if (match) rows.push({ id: match[1], page: match[2], scope: match[3], summary: match[4] });
    }
    return rows;
  }

  it("lists exactly the registered detectors in the README table", async () => {
    const rows = await readmeRows();
    expect(rows.map((row) => row.id).sort()).toEqual([...DETECTOR_IDS].sort());
  });

  it("matches each README row's scope and summary to the detector's definition", async () => {
    const rows = new Map((await readmeRows()).map((row) => [row.id, row]));
    for (const definition of DETECTOR_DEFINITIONS) {
      const row = rows.get(definition.id);
      expect({ id: definition.id, scope: row?.scope, summary: row?.summary }).toEqual({
        id: definition.id,
        scope: definition.kind === "single" ? "file" : "project",
        summary: definition.summary,
      });
    }
  });

  it("links every detector to its own docs/detectors page, with no page left over", async () => {
    const linkedPages = (await readmeRows()).map((row) => row.page).sort();
    const pages = readdirSync(join(repoRoot, "docs/detectors"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => `docs/detectors/${file}`)
      .sort();
    expect(linkedPages).toEqual(pages);
    expect(new Set(linkedPages).size).toBe(DETECTOR_IDS.length);

    for (const row of await readmeRows()) {
      const page = await Bun.file(join(repoRoot, row.page)).text();
      expect({ page: row.page, heading: page.split("\n")[0] }).toEqual({
        page: row.page,
        heading: expect.stringMatching(new RegExp(`^# \`${row.id}\` `)),
      });
    }
  });
});
