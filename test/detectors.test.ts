import { parseSync } from "oxc-parser";

import { describe, expect, it } from "bun:test";

import { buildLineOf, type CrossDetector, type Ctx, type SingleDetector } from "../src/ast.ts";
import { detectDuplicateSymbol } from "../src/detectors/duplicate-symbol.ts";
import { detectPassThroughMethod } from "../src/detectors/pass-through-method.ts";
import { detectUniqueImplementation } from "../src/detectors/unique-implementation.ts";
import { detectWideSignature } from "../src/detectors/wide-signature.ts";

// Inline sources still pass through the real parser and Ctx shape; tests assert
// detector contracts without coupling to traversal internals or fixture files.
function parseInline(file: string, source: string): Ctx {
  const text = source.trimStart();
  const parsed = parseSync(file, text);
  return {
    file,
    source: text,
    ast: parsed.program,
    lineOf: buildLineOf(text),
  };
}

function runSingle(detect: SingleDetector, source: string, file = "src/case.ts") {
  return detect(parseInline(file, source));
}

function runCross(detect: CrossDetector, sources: Record<string, string>) {
  return detect(Object.entries(sources).map(([file, source]) => parseInline(file, source)));
}

function withHarmlessLeadingComment(source: string): string {
  return `// harmless file header\n${source}`;
}

function expectSingleFingerprintStable(
  detect: SingleDetector,
  source: string,
  file = "src/case.ts",
) {
  const baseFinding = runSingle(detect, source, file)[0];
  const shiftedFinding = runSingle(detect, withHarmlessLeadingComment(source), file)[0];

  expect(baseFinding.fingerprint).toBe(shiftedFinding.fingerprint);
}

function expectCrossFingerprintStable(detect: CrossDetector, sources: Record<string, string>) {
  const baseFinding = runCross(detect, sources)[0];
  const shiftedSources = Object.fromEntries(
    Object.entries(sources).map(([file, source]) => [file, withHarmlessLeadingComment(source)]),
  );
  const shiftedFinding = runCross(detect, shiftedSources)[0];

  expect(baseFinding.fingerprint).toBe(shiftedFinding.fingerprint);
}

describe("finding fingerprints", () => {
  it("keeps representative detector fingerprints stable across harmless line shifts", () => {
    expectSingleFingerprintStable(
      detectWideSignature,
      "function connect(a: A, b: B, c: C, d: D, e: E) {}\n",
    );
    expectSingleFingerprintStable(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        getUser(id: string) {
          return this.repo.getUser(id);
        }
      }
      `,
    );
    expectCrossFingerprintStable(detectDuplicateSymbol, {
      "src/a.ts": "export const API_URL = 'https://api.example';",
      "src/b.ts": "export const API_URL = 'https://api.example';",
    });
  });
});

describe("detectPassThroughMethod", () => {
  it("flags class methods that only delegate to instance state with the same args", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        getUser(id: string) {
          return this.repo.getUser(id);
        }
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].flag).toBe("passThroughMethod");
  });

  it("flags await-only collaborator delegation", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        async getUser(id: string) {
          return await this.repo.getUser(id);
        }
      }
      `,
    );

    expect(findings).toHaveLength(1);
  });

  it("flags collaborator delegation with a shared method-name stem", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class CacheFacade {
        cache: any;
        invalidate(key: string) {
          return this.cache.invalidateKey(key);
        }
      }
      `,
    );

    expect(findings).toHaveLength(1);
  });

  it("flags underscore-prefixed methods when they are otherwise public pass-throughs", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        _saveUser(user: User) {
          return this.repo.saveUser(user);
        }
      }
      `,
    );

    expect(findings).toHaveLength(1);
  });

  it("adds class-surface evidence to each pass-through method finding", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        getUser(id: string) {
          return this.repo.getUser(id);
        }
        deleteUser(id: string) {
          return this.repo.deleteUser(id);
        }
        saveUser(user: User) {
          return this.repo.saveUser(user);
        }
        hydrateUser(id: string) {
          return { id };
        }
      }
      `,
    );

    expect(findings).toHaveLength(3);
    for (const finding of findings) {
      expect(finding.severity).toBe("candidate");
      expect(finding.metadata).toMatchObject({
        className: "UserService",
        passThroughMethodCount: 3,
        publicMethodCount: 4,
        passThroughRatio: 0.75,
        concentrated: true,
      });
    }
    expect(findings[0].metadata).toMatchObject({
      methodName: "getUser",
      receiver: "this.repo",
      callee: "this.repo.getUser",
    });
  });

  it("ignores wrappers that add behavior before delegating", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        getUser(id: string) {
          return this.repo.getUser(id.trim());
        }
      }
      `,
    );

    expect(findings).toEqual([]);
  });

  it("ignores non-public, self, reordered, transformed, and unrelated delegation", () => {
    const findings = runSingle(
      detectPassThroughMethod,
      `
      class UserService {
        repo: any;
        private getUser(id: string) {
          return this.repo.getUser(id);
        }
        protected deleteUser(id: string) {
          return this.repo.deleteUser(id);
        }
        loadUser(id: string) {
          return this.loadUser(id);
        }
        copyUser(from: string, to: string) {
          return this.repo.copyUser(to, from);
        }
        normalizeUser(id: string) {
          return this.repo.normalizeUser(id.trim());
        }
        findUser(id: string) {
          return this.repo.loadById(id);
        }
      }
      `,
    );

    expect(findings).toEqual([]);
  });
});

describe("detectWideSignature", () => {
  it("flags functions with more than four required positional params", () => {
    const findings = runSingle(
      detectWideSignature,
      "function connect(a: A, b: B, c: C, d: D, e: E) {}\n",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toEqual({ name: "connect", requiredParams: 5 });
  });

  it("does not count optional and default params as required surface", () => {
    const findings = runSingle(
      detectWideSignature,
      "function configure(a: A, b: B, c: C, d: D, optional?: E, mode = 'safe') {}\n",
    );

    expect(findings).toEqual([]);
  });
});

describe("detectDuplicateSymbol", () => {
  it("flags repeated top-level declarations across project files", () => {
    const findings = runCross(detectDuplicateSymbol, {
      "src/a.ts": "export const API_URL = 'https://api.example';",
      "src/b.ts": "export const API_URL = 'https://api.example';",
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toMatchObject({
      symbolKind: "const",
      distinctFiles: 2,
      totalDeclarations: 2,
    });
  });

  it("ignores duplicate-looking declarations in test and generated files", () => {
    const findings = runCross(detectDuplicateSymbol, {
      "src/a.ts": "export const API_URL = 'https://api.example';",
      "test/a.test.ts": "export const API_URL = 'https://api.example';",
      "src/generated/copy.ts": "export const API_URL = 'https://api.example';",
    });

    expect(findings).toEqual([]);
  });
});

describe("detectUniqueImplementation", () => {
  it("flags interfaces with one implementer and abstract classes with no subclasses", () => {
    const findings = runCross(detectUniqueImplementation, {
      "src/port.ts": "export interface Port { send(value: string): void; }",
      "src/adapter.ts":
        "import { Port } from './port'; export class Adapter implements Port { send(value: string) {} }",
      "src/base.ts": "export abstract class BaseJob { abstract run(): void; }",
    });

    expect(findings.map((finding) => finding.metadata.name).sort()).toEqual(["BaseJob", "Port"]);
  });

  it("keeps same-name interfaces scoped while allowing real polymorphism", () => {
    const findings = runCross(detectUniqueImplementation, {
      "src/contracts.ts": "export interface Repository { find(id: string): string; }",
      "src/sql.ts":
        "import { Repository } from './contracts'; export class SqlRepository implements Repository { find(id: string) { return id; } }",
      "src/memory.ts":
        "import { Repository } from './contracts'; export class MemoryRepository implements Repository { find(id: string) { return id; } }",
      "src/local.ts": "interface Repository { save(id: string): void; }",
    });

    expect(findings).toEqual([]);
  });
});
