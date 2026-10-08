import { describe, expect, it } from "bun:test";

import { findingEvidence, findingFiles } from "../src/detectors/registry.ts";
import type { Finding } from "../src/types.ts";

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
