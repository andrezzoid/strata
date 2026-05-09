import { parseSync } from "oxc-parser";

import { describe, expect, it } from "bun:test";

import { buildLineOf, type CrossDetector, type Ctx, type SingleDetector } from "../src/ast.ts";
import { detectCatchRethrow, detectEmptyCatch } from "../src/detectors/catch-handling.ts";
import { detectDuplicateSymbol } from "../src/detectors/duplicate-symbol.ts";
import { detectGenericNaming } from "../src/detectors/generic-naming.ts";
import { detectOrphanFile } from "../src/detectors/orphan-file.ts";
import { detectPassThroughMethod } from "../src/detectors/pass-through-method.ts";
import { detectPassThroughVariable } from "../src/detectors/pass-through-variable.ts";
import { detectShallowModule } from "../src/detectors/shallow-module.ts";
import { detectTsEscapeHatches } from "../src/detectors/ts-escape-hatches.ts";
import { detectUniqueImplementation } from "../src/detectors/unique-implementation.ts";
import { detectWideModule } from "../src/detectors/wide-module.ts";
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
    comments: parsed.comments ?? [],
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
      detectShallowModule,
      `
      export const one = 1;
      export const two = 2;
      export const three = 3;
      `,
    );
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
    expectSingleFingerprintStable(
      detectEmptyCatch,
      `
      try {
        work();
      } catch (error) {}
      `,
    );
    expectSingleFingerprintStable(detectTsEscapeHatches, "const value = input as any;\n");
    expectCrossFingerprintStable(detectDuplicateSymbol, {
      "src/a.ts": "export const API_URL = 'https://api.example';",
      "src/b.ts": "export const API_URL = 'https://api.example';",
    });
  });

  it("keeps same-detector findings in one file distinct", () => {
    const escapeFindings = runSingle(
      detectTsEscapeHatches,
      `
      // @ts-ignore legacy API
      callOne();
      // @ts-ignore legacy API
      callTwo();
      `,
    );
    const catchFindings = runSingle(
      detectEmptyCatch,
      `
      try { one(); } catch (error) {}
      try { two(); } catch (error) {}
      `,
    );

    expect(escapeFindings).toHaveLength(2);
    expect(new Set(escapeFindings.map((finding) => finding.fingerprint)).size).toBe(2);
    expect(catchFindings).toHaveLength(2);
    expect(new Set(catchFindings.map((finding) => finding.fingerprint)).size).toBe(2);
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
});

describe("detectPassThroughVariable", () => {
  it("flags plumbing functions whose params are only forwarded together", () => {
    const findings = runSingle(
      detectPassThroughVariable,
      `
      function handle(request: Request, config: Config, logger: Logger, metrics: Metrics) {
        authenticate(request, config, logger, metrics);
        authorize(request, config, logger, metrics);
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata.passThroughParams).toEqual([
      "request",
      "config",
      "logger",
      "metrics",
    ]);
  });

  it("ignores functions that read forwarded values locally", () => {
    const findings = runSingle(
      detectPassThroughVariable,
      `
      function handle(request: Request, config: Config, logger: Logger, metrics: Metrics) {
        logger.info(config.mode);
        authenticate(request, metrics);
        return request.id;
      }
      `,
    );

    expect(findings).toEqual([]);
  });
});

describe("catch-handling detectors", () => {
  it("flags catches with no executable body, including comments-only bodies", () => {
    const findings = runSingle(
      detectEmptyCatch,
      `
      try {
        work();
      } catch (error) {
        // intentionally swallowed
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].flag).toBe("emptyCatch");
  });

  it("ignores catches that do useful work", () => {
    const findings = runSingle(
      detectEmptyCatch,
      `
      try {
        work();
      } catch (error) {
        report(error);
      }
      `,
    );

    expect(findings).toEqual([]);
  });

  it("flags catches whose only behavior is rethrowing the same error", () => {
    const findings = runSingle(
      detectCatchRethrow,
      `
      try {
        work();
      } catch (error) {
        throw error;
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].flag).toBe("catchRethrow");
  });

  it("ignores catches that wrap the error before throwing", () => {
    const findings = runSingle(
      detectCatchRethrow,
      `
      try {
        work();
      } catch (error) {
        throw new Error(String(error));
      }
      `,
    );

    expect(findings).toEqual([]);
  });
});

describe("detectGenericNaming", () => {
  it("flags type declarations with catch-all suffixes", () => {
    const findings = runSingle(detectGenericNaming, "type RequestHelper = { id: string };");

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata.name).toBe("RequestHelper");
  });

  it("ignores specific domain names", () => {
    const findings = runSingle(detectGenericNaming, "type RequestEnvelope = { id: string };");

    expect(findings).toEqual([]);
  });
});

describe("detectTsEscapeHatches", () => {
  it("flags any-casts and TypeScript suppression comments", () => {
    const findings = runSingle(
      detectTsEscapeHatches,
      `
      const value = input as any;
      // @ts-expect-error legacy API
      callMissing(value);
      `,
    );

    expect(findings.map((finding) => finding.metadata.kind).sort()).toEqual([
      "@ts-expect-error",
      "asAny",
    ]);
  });

  it("ignores non-any casts and normal TypeScript comments", () => {
    const findings = runSingle(
      detectTsEscapeHatches,
      `
      const value = input as unknown;
      // @ts-check
      use(value);
      `,
    );

    expect(findings).toEqual([]);
  });
});

describe("module surface detectors", () => {
  it("flags modules whose exported surface dominates their body", () => {
    const findings = runSingle(
      detectShallowModule,
      `
      export const one = 1;
      export const two = 2;
      export const three = 3;
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toEqual({ surface: 3, bodyLines: 3 });
  });

  it("ignores modules with a small caller-facing surface", () => {
    const findings = runSingle(
      detectShallowModule,
      `
      export function calculate(items: number[]) {
        let total = 0;
        for (const item of items) {
          total += item;
        }
        if (total > 100) {
          total -= 10;
        }
        return total;
      }
      `,
    );

    expect(findings).toEqual([]);
  });

  it("flags modules with more than ten top-level exports", () => {
    const findings = runSingle(
      detectWideModule,
      `
      export const v1 = 1;
      export const v2 = 2;
      export const v3 = 3;
      export const v4 = 4;
      export const v5 = 5;
      export const v6 = 6;
      export const v7 = 7;
      export const v8 = 8;
      export const v9 = 9;
      export const v10 = 10;
      export const v11 = 11;
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata.exports).toBe(11);
  });

  it("keeps ten top-level exports below the wide-module threshold", () => {
    const findings = runSingle(
      detectWideModule,
      `
      export const v1 = 1;
      export const v2 = 2;
      export const v3 = 3;
      export const v4 = 4;
      export const v5 = 5;
      export const v6 = 6;
      export const v7 = 7;
      export const v8 = 8;
      export const v9 = 9;
      export const v10 = 10;
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

describe("detectOrphanFile", () => {
  it("flags unimported project files while preserving entrypoint, test, and generated skips", () => {
    const findings = runCross(detectOrphanFile, {
      "src/index.ts": "import './used';",
      "src/used.ts": "export const used = true;",
      "src/unused.ts": "export const unused = true;",
      "test/helper.ts": "export const helper = true;",
      "src/generated/unused.ts": "export const generated = true;",
    });

    expect(findings.map((finding) => finding.file)).toEqual(["src/unused.ts"]);
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
