import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "bun:test";

import {
  DETECTOR_DEFINITIONS,
  findingEvidence,
  findingFiles,
  type DetectorDefinition,
} from "../src/detectors/registry.ts";
import type { Finding } from "../src/types.ts";

const repoRoot = resolve(dirname(Bun.fileURLToPath(import.meta.url)), "..");

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

type ReadmeRow = { id: string; docsPage: string; scope: string; summary: string };

async function readReadmeDetectorRows(): Promise<ReadmeRow[]> {
  const readme = await Bun.file(join(repoRoot, "README.md")).text();
  const rowPattern =
    /^\| \[`(\w+)`\]\((docs\/detectors\/[\w-]+\.md)\)\s*\| (\w+)\s*\| (.+?)\s*\|$/gm;
  return [...readme.matchAll(rowPattern)].map(([, id, docsPage, scope, summary]) => ({
    id: id!,
    docsPage: docsPage!,
    scope: scope!,
    summary: summary!,
  }));
}

describe("detector definitions", () => {
  it("require every hook shared modules rely on", () => {
    const base = {
      id: "typeOnly",
      name: "Type only",
      summary: "Type-only definition.",
      description: "Type-only definition.",
      evidence: () => [],
    };
    // @ts-expect-error cross-file detectors must declare relatedFiles for --touched-since.
    const crossWithoutRelatedFiles: DetectorDefinition = {
      ...base,
      kind: "cross",
      detect: () => [],
    };
    // @ts-expect-error every detector must declare its text-report evidence.
    const withoutEvidence: DetectorDefinition = {
      id: "typeOnly",
      name: "Type only",
      summary: "Type-only definition.",
      description: "Type-only definition.",
      kind: "single",
      detect: () => [],
    };
    // @ts-expect-error single-file findings involve only their anchor file.
    const singleWithRelatedFiles: DetectorDefinition = {
      ...base,
      kind: "single",
      detect: () => [],
      relatedFiles: () => [],
    };
    expect([crossWithoutRelatedFiles, withoutEvidence, singleWithRelatedFiles]).toHaveLength(3);
  });

  it("match the README detector table and docs pages in both directions", async () => {
    const rows = await readReadmeDetectorRows();
    const docsPages = readdirSync(join(repoRoot, "docs/detectors"))
      .map((page) => `docs/detectors/${page}`)
      .sort();

    expect(rows.map((row) => row.id).sort()).toEqual(
      DETECTOR_DEFINITIONS.map((definition) => definition.id).sort(),
    );
    for (const definition of DETECTOR_DEFINITIONS) {
      const row = rows.find((candidate) => candidate.id === definition.id)!;
      expect(row.summary).toBe(definition.summary);
      expect(row.scope).toBe(definition.kind === "single" ? "file" : "project");
    }
    expect(rows.map((row) => row.docsPage).sort()).toEqual(docsPages);
  });
});

describe("findingFiles", () => {
  it("lists the anchor first, then related files without repeats", () => {
    expect(
      findingFiles(
        finding("duplicateSymbol", "src/a.ts", {
          occurrences: [
            { name: "A", file: "src/a.ts", line: 1 },
            { name: "B", file: "src/b.ts", line: 1 },
            { name: "C", file: "src/b.ts", line: 9 },
          ],
        }),
      ),
    ).toEqual(["src/a.ts", "src/b.ts"]);
    expect(
      findingFiles(
        finding("uniqueImplementation", "src/port.ts", {
          implementers: [{ implementer: "Adapter", file: "src/adapter.ts", line: 4 }],
        }),
      ),
    ).toEqual(["src/port.ts", "src/adapter.ts"]);
  });

  it("involves the call sites that repeat a forced rare option value", () => {
    expect(
      findingFiles(
        finding("forcedRareOption", "api.ts", {
          kind: "parameter",
          callSites: [
            { file: "a.ts", line: 2 },
            { file: "b.ts", line: 2 },
          ],
        }),
      ),
    ).toEqual(["api.ts", "a.ts", "b.ts"]);
    expect(
      findingFiles(
        finding("forcedRareOption", "a.ts", {
          kind: "placeholderArgs",
          declaration: { file: "api.ts", line: 1 },
        }),
      ),
    ).toEqual(["a.ts"]);
  });

  it("falls back to the anchor for single-file and unknown detectors", () => {
    expect(findingFiles(finding("wideSignature", "src/a.ts", { requiredParams: 5 }))).toEqual([
      "src/a.ts",
    ]);
    expect(findingFiles(finding("notADetector", "src/a.ts", {}))).toEqual(["src/a.ts"]);
  });
});

describe("findingEvidence", () => {
  it("shows how many calls repeat a forced rare option value and where, capped at five", () => {
    const callSites = [1, 2, 3, 4, 5, 6, 7].map((line) => ({ file: "a.ts", line }));
    expect(
      findingEvidence(
        finding("forcedRareOption", "api.ts", {
          kind: "option",
          value: "true",
          repeatedCount: 7,
          callCount: 8,
          callSites,
        }),
      ),
    ).toEqual([
      "evidence: 7/8 calls pass true:",
      "  a.ts:1",
      "  a.ts:2",
      "  a.ts:3",
      "  a.ts:4",
      "  a.ts:5",
      "  +2 more",
    ]);
  });

  it("returns no evidence for unknown detectors", () => {
    expect(findingEvidence(finding("notADetector", "src/a.ts", {}))).toEqual([]);
  });
});
