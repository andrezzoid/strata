import { describe, expect, it } from "bun:test";

import { meetsLineCoverageThreshold, summarizeLcov } from "../scripts/check-coverage.ts";

describe("summarizeLcov", () => {
  it("aggregates hit and found lines across LCOV records", () => {
    const summary = summarizeLcov(
      [
        "TN:",
        "SF:src/a.ts",
        "LF:4",
        "LH:3",
        "end_of_record",
        "TN:",
        "SF:src/b.ts",
        "LF:6",
        "LH:6",
        "end_of_record",
      ].join("\n"),
    );

    expect(summary.linesHit).toBe(9);
    expect(summary.linesFound).toBe(10);
    expect(summary.linePercent).toBe(90);
  });

  it("ignores non-source records when calculating the gate", () => {
    const summary = summarizeLcov(
      [
        "TN:",
        "SF:scripts/check-coverage.ts",
        "LF:50",
        "LH:0",
        "end_of_record",
        "TN:",
        "SF:src/scanner.ts",
        "LF:10",
        "LH:9",
        "end_of_record",
      ].join("\n"),
    );

    expect(summary.linesHit).toBe(9);
    expect(summary.linesFound).toBe(10);
    expect(summary.linePercent).toBe(90);
  });

  it("treats an empty LCOV report as 0% coverage", () => {
    const summary = summarizeLcov("TN:\nend_of_record\n");

    expect(summary.linesHit).toBe(0);
    expect(summary.linesFound).toBe(0);
    expect(summary.linePercent).toBe(0);
  });
});

describe("meetsLineCoverageThreshold", () => {
  it("passes at the threshold and fails below it", () => {
    expect(meetsLineCoverageThreshold({ linesHit: 90, linesFound: 100, linePercent: 90 }, 90)).toBe(
      true,
    );
    expect(meetsLineCoverageThreshold({ linesHit: 89, linesFound: 100, linePercent: 89 }, 90)).toBe(
      false,
    );
  });
});
