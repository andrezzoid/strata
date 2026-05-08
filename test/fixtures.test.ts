import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanProject } from "../src/scan.ts";

type ExpectedFinding = { flag: string; file: string; line: number };
type ExpectedFixture = { findings: ExpectedFinding[] };

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "fixtures");

function readExpected(path: string): ExpectedFixture {
  return JSON.parse(readFileSync(path, "utf8")) as ExpectedFixture;
}

function comparable(findings: ExpectedFinding[]): string[] {
  return findings.map((finding) => `${finding.flag}\t${finding.file}\t${finding.line}`).sort();
}

describe("fixtures", () => {
  const fixtureDirs = readdirSync(fixturesRoot)
    .map((entry) => join(fixturesRoot, entry))
    .filter((path) => statSync(path).isDirectory())
    .filter((path) => statSync(join(path, "expected.json"), { throwIfNoEntry: false }));

  for (const fixtureDir of fixtureDirs) {
    it(`matches ${basename(fixtureDir)}`, () => {
      const expected = readExpected(join(fixtureDir, "expected.json"));
      const primaryFlag = expected.findings[0]?.flag;
      expect(primaryFlag).toBeTruthy();

      const actual = scanProject({ target: fixtureDir });
      const actualForFlag = actual.findings
        .filter((finding) => finding.flag === primaryFlag)
        .map(({ flag, file, line }) => ({ flag, file, line }));

      expect(comparable(actualForFlag)).toEqual(comparable(expected.findings));
    });
  }
});
