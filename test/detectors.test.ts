import { parseSync } from "oxc-parser";

import { describe, expect, it } from "bun:test";

import { buildLineOf, type CrossDetector, type Ctx, type SingleDetector } from "../src/ast.ts";
import { detectDuplicateSymbol } from "../src/detectors/duplicate-symbol.ts";
import { detectExposedMutableRepresentation } from "../src/detectors/exposed-mutable-representation.ts";
import { detectForcedRareOption } from "../src/detectors/forced-rare-option.ts";
import { detectPassThroughExport } from "../src/detectors/pass-through-export.ts";
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
      "export function connect(a: A, b: B, c: C, d: D, e: E) {}\n",
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
      detectPassThroughExport,
      `
      import { parseConfig } from "./config-parser";

      export function parseConfigFile(path: string) {
        return parseConfig(path);
      }
      `,
    );
    expectCrossFingerprintStable(detectForcedRareOption, {
      "src/response.ts":
        "export function createHttpResponse(request: Request, version: string, status: number, headers: Headers, body: Body) {}",
      "src/calls.ts": `
        import { createHttpResponse } from "./response";
        createHttpResponse(req, "HTTP/1.1", 200, {}, body);
        createHttpResponse(req, "HTTP/1.1", 404, {}, body);
        createHttpResponse(req, "HTTP/1.1", 201, {}, body);
      `,
    });
    expectCrossFingerprintStable(detectDuplicateSymbol, {
      "src/a.ts": "export const API_URL = 'https://api.example';",
      "src/b.ts": "export const API_URL = 'https://api.example';",
    });
  });
});

describe("detectPassThroughExport", () => {
  it("flags exported function declarations that only forward same-order args", () => {
    const findings = runSingle(
      detectPassThroughExport,
      `
      import { parseConfig } from "./config-parser";

      export function parseConfigFile(path: string) {
        return parseConfig(path);
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].flag).toBe("passThroughExport");
    expect(findings[0].metadata).toMatchObject({
      functionName: "parseConfigFile",
      callee: "parseConfig",
      paramCount: 1,
    });
  });

  it("flags exported const arrows and await-only forwarding", () => {
    const findings = runSingle(
      detectPassThroughExport,
      `
      import { parseConfig } from "./config-parser";
      import { loadConfig } from "./config-loader";

      export const parseConfigFile = (path: string) => parseConfig(path);

      export async function loadConfigFile(path: string) {
        return await loadConfig(path);
      }
      `,
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.metadata.functionName)).toEqual([
      "parseConfigFile",
      "loadConfigFile",
    ]);
  });

  it("ignores plain barrel re-exports", () => {
    const findings = runSingle(
      detectPassThroughExport,
      `
      export { Button } from "./button";
      export { Dialog as ModalDialog } from "./dialog";
      `,
    );

    expect(findings).toEqual([]);
  });

  it("ignores non-exported, transformed, reordered, and unrelated delegation", () => {
    const findings = runSingle(
      detectPassThroughExport,
      `
      import { copyFile, loadById, parseConfig } from "./internals";

      function parseConfigFile(path: string) {
        return parseConfig(path);
      }

      export function parseConfigFileSafe(path: string) {
        return parseConfig(path.trim());
      }

      export function copyFileTo(from: string, to: string) {
        return copyFile(to, from);
      }

      export function findUser(id: string) {
        return loadById(id);
      }
      `,
    );

    expect(findings).toEqual([]);
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
  it("flags exported functions with more than four required positional params", () => {
    const findings = runSingle(
      detectWideSignature,
      "export function connect(a: A, b: B, c: C, d: D, e: E) {}\n",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toEqual({ name: "connect", requiredParams: 5 });
  });

  it("ignores non-exported and private implementation signatures", () => {
    const findings = runSingle(
      detectWideSignature,
      `
      function buildConnection(a: A, b: B, c: C, d: D, e: E) {}

      class InternalService {
        constructor(a: A, b: B, c: C, d: D, e: E) {}
        publish(a: A, b: B, c: C, d: D, e: E) {}
      }

      export class PublicService {
        private build(a: A, b: B, c: C, d: D, e: E) {}
        protected prepare(a: A, b: B, c: C, d: D, e: E) {}
        #secret(a: A, b: B, c: C, d: D, e: E) {}
      }
      `,
    );

    expect(findings).toEqual([]);
  });

  it("flags public members on exported classes", () => {
    const findings = runSingle(
      detectWideSignature,
      `
      export class PublicService {
        constructor(a: A, b: B, c: C, d: D, e: E) {}
        publish(a: A, b: B, c: C, d: D, e: E) {}
      }
      `,
    );

    expect(findings.map((finding) => finding.metadata)).toEqual([
      { name: "constructor", requiredParams: 5 },
      { name: "method publish", requiredParams: 5 },
    ]);
  });

  it("does not count optional and default params as required surface", () => {
    const findings = runSingle(
      detectWideSignature,
      "export function configure(a: A, b: B, c: C, d: D, optional?: E, mode = 'safe') {}\n",
    );

    expect(findings).toEqual([]);
  });
});

describe("detectForcedRareOption", () => {
  it("flags exported function params whose callers repeatedly pass literals or empty objects", () => {
    const findings = runCross(detectForcedRareOption, {
      "src/response.ts": `
        export function createHttpResponse(request: Request, version: string, status: number, headers: Headers, body: Body) {}
      `,
      "src/calls.ts": `
        import { createHttpResponse } from "./response";

        createHttpResponse(req, "HTTP/1.1", 200, {}, body);
        createHttpResponse(req, "HTTP/1.1", 404, {}, body);
        createHttpResponse(req, "HTTP/1.1", 201, {}, body);
        createHttpResponse(req, "HTTP/1.1", 500, {}, body);
      `,
    });

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.metadata)).toEqual([
      expect.objectContaining({
        apiName: "createHttpResponse",
        kind: "parameter",
        parameterName: "version",
        repeatedCount: 4,
        callCount: 4,
      }),
      expect.objectContaining({
        apiName: "createHttpResponse",
        kind: "parameter",
        parameterName: "headers",
        repeatedCount: 4,
        callCount: 4,
      }),
    ]);
  });

  it("flags options object keys that repeat default-like values", () => {
    const findings = runCross(detectForcedRareOption, {
      "src/render.ts": `
        export type RenderOptions = {
          mode?: "full" | "compact";
          cache?: boolean;
          debug?: boolean;
          retries?: number;
          locale?: string;
        };

        export function renderPage(page: Page, options: RenderOptions) {}
      `,
      "src/calls.ts": `
        import { renderPage } from "./render";

        renderPage(page, { mode: "full", cache, debug, retries, locale });
        renderPage(page, { mode: "full", cache, debug, retries, locale });
        renderPage(page, { mode: "full", cache, debug, retries, locale });
        renderPage(page, { mode: "full", cache, debug, retries, locale });
      `,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toMatchObject({
      apiName: "renderPage",
      kind: "option",
      parameterName: "options",
      optionName: "mode",
      repeatedCount: 4,
      callCount: 4,
    });
  });

  it("reports placeholder arguments at the call site", () => {
    const findings = runCross(detectForcedRareOption, {
      "src/modal.ts": `
        export function openModal(title: string, size?: Size, position?: Position, autofocus?: boolean) {}
      `,
      "src/calls.ts": `
        import { openModal } from "./modal";

        openModal("Delete account", undefined, undefined, true);
      `,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "src/calls.ts", line: 3 });
    expect(findings[0].metadata).toMatchObject({
      apiName: "openModal",
      kind: "placeholderArgs",
      placeholderPositions: [1, 2],
    });
  });

  it("checks exported class constructors", () => {
    const findings = runCross(detectForcedRareOption, {
      "src/response.ts": `
        export class HttpResponse {
          constructor(request: Request, version: string, status: number, headers: Headers, body: Body) {}
        }
      `,
      "src/calls.ts": `
        import { HttpResponse } from "./response";

        new HttpResponse(req, "HTTP/1.1", 200, {}, body);
        new HttpResponse(req, "HTTP/1.1", 404, {}, body);
        new HttpResponse(req, "HTTP/1.1", 201, {}, body);
      `,
    });

    expect(findings.map((finding) => finding.metadata.parameterName)).toEqual([
      "version",
      "headers",
    ]);
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

describe("detectExposedMutableRepresentation", () => {
  const positiveExportCases = [
    {
      name: "a directly exported named class with a private method exposure",
      source: `
        export class ObjectStore {
          private readonly state: { value: string } = { value: "ready" };
          stateView(): { value: string } {
            return (this.state);
          }
        }
      `,
      metadata: {
        className: "ObjectStore",
        fieldName: "state",
        mutableFamily: "object",
        accessors: [{ name: "stateView", kind: "method", line: 3 }],
      },
    },
    {
      name: "a same-file named export with a private-identifier getter exposure",
      source: `
        class ArrayStore {
          #items = ["ready"];
          get itemsView() {
            return this.#items;
          }
        }
        export { ArrayStore as PublicArrayStore };
      `,
      metadata: {
        className: "ArrayStore",
        fieldName: "#items",
        mutableFamily: "array",
        accessors: [{ name: "itemsView", kind: "getter", line: 3 }],
      },
    },
    {
      name: "a directly exported named default class",
      source: `
        export default class MapStore {
          private values: Map<string, number>;
          valuesView() {
            return this.values;
          }
        }
      `,
      metadata: {
        className: "MapStore",
        fieldName: "values",
        mutableFamily: "Map",
        accessors: [{ name: "valuesView", kind: "method", line: 3 }],
      },
    },
    {
      name: "a same-file default value export",
      source: `
        class SetStore {
          private values = new Set<string>();
          valuesView() {
            return this.values;
          }
        }
        export default SetStore;
      `,
      metadata: {
        className: "SetStore",
        fieldName: "values",
        mutableFamily: "Set",
        accessors: [{ name: "valuesView", kind: "method", line: 3 }],
      },
    },
    {
      name: "an anonymous default class",
      source: `
        export default class {
          #values = new WeakSet<object>();
          get valuesView() {
            return this.#values;
          }
        }
      `,
      metadata: {
        className: "<default>",
        fieldName: "#values",
        mutableFamily: "WeakSet",
        accessors: [{ name: "valuesView", kind: "getter", line: 3 }],
      },
    },
  ];

  for (const testCase of positiveExportCases) {
    it(`flags ${testCase.name}`, () => {
      const findings = runSingle(detectExposedMutableRepresentation, testCase.source);

      expect(findings).toHaveLength(1);
      expect(findings[0].metadata).toMatchObject(testCase.metadata);
    });
  }

  it("accepts harmless parentheses around the this receiver", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private items: string[] = [];
        itemsView() { return (this).items; }
      }
      `,
    );

    expect(findings).toHaveLength(1);
  });

  it("recognizes a same-file class exported through a parenthesized default expression", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      class Store {
        private items: string[] = [];
        itemsView() { return this.items; }
      }
      export default (Store);
      `,
    );

    expect(findings).toHaveLength(1);
  });

  it("uses string evidence names for noncomputed numeric methods and getters", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private items: string[] = [];
        private tags = new Set<string>();
        1() { return this.items; }
        get 2() { return this.tags; }
      }
      `,
    );

    expect(findings.map((finding) => finding.metadata.accessors)).toEqual([
      [{ name: "1", kind: "method", line: 4 }],
      [{ name: "2", kind: "getter", line: 5 }],
    ]);
  });

  it("classifies transparent parentheses without unwrapping assertions", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private typed: (Map<string, string>);
        private initialized = (new Set<string>());
        private returned = new WeakSet<object>();
        private asserted = ([] as string[]);
        typedView() { return this.typed; }
        initializedView() { return this.initialized; }
        returnedView(): (WeakSet<object>) { return this.returned; }
        assertedView() { return this.asserted; }
      }
      `,
    );

    expect(
      findings.map((finding) => [finding.metadata.fieldName, finding.metadata.mutableFamily]),
    ).toEqual([
      ["typed", "Map"],
      ["initialized", "Set"],
      ["returned", "WeakSet"],
    ]);
  });

  it("classifies every mutable family from direct annotations and initializers", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class MutableFamilies {
        private objectAnnotation: { value: string };
        private arrayAnnotation: string[];
        private mapAnnotation: Map<string, string>;
        private setAnnotation: Set<string>;
        private weakMapAnnotation: WeakMap<object, object>;
        private weakSetAnnotation: WeakSet<object>;
        private objectInitializer = {};
        private arrayInitializer = [];
        private mapInitializer = new Map();
        private setInitializer = new Set();
        private weakMapInitializer = new WeakMap();
        private weakSetInitializer = new WeakSet();

        objectAnnotationView() { return this.objectAnnotation; }
        arrayAnnotationView() { return this.arrayAnnotation; }
        mapAnnotationView() { return this.mapAnnotation; }
        setAnnotationView() { return this.setAnnotation; }
        weakMapAnnotationView() { return this.weakMapAnnotation; }
        weakSetAnnotationView() { return this.weakSetAnnotation; }
        objectInitializerView() { return this.objectInitializer; }
        arrayInitializerView() { return this.arrayInitializer; }
        mapInitializerView() { return this.mapInitializer; }
        setInitializerView() { return this.setInitializer; }
        weakMapInitializerView() { return this.weakMapInitializer; }
        weakSetInitializerView() { return this.weakSetInitializer; }
      }
      `,
    );

    expect(findings).toHaveLength(12);
    expect(
      Object.fromEntries(
        findings.map(
          (finding) =>
            [finding.metadata.fieldName as string, finding.metadata.mutableFamily] as const,
        ),
      ),
    ).toEqual({
      objectAnnotation: "object",
      arrayAnnotation: "array",
      mapAnnotation: "Map",
      setAnnotation: "Set",
      weakMapAnnotation: "WeakMap",
      weakSetAnnotation: "WeakSet",
      objectInitializer: "object",
      arrayInitializer: "array",
      mapInitializer: "Map",
      setInitializer: "Set",
      weakMapInitializer: "WeakMap",
      weakSetInitializer: "WeakSet",
    });
  });

  it("accepts every writable type-literal member shape produced by OXC", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class TypeLiteralStore {
        private property: { value: string };
        private index: { [key: string]: number };
        private method: { clear(): void };
        private setter: { set value(next: string) };

        propertyView() { return this.property; }
        indexView() { return this.index; }
        methodView() { return this.method; }
        setterView() { return this.setter; }
      }
      `,
    );

    expect(findings).toHaveLength(4);
    expect(findings.map((finding) => finding.metadata)).toEqual([
      expect.objectContaining({ fieldName: "property", mutableFamily: "object" }),
      expect.objectContaining({ fieldName: "index", mutableFamily: "object" }),
      expect.objectContaining({ fieldName: "method", mutableFamily: "object" }),
      expect.objectContaining({ fieldName: "setter", mutableFamily: "object" }),
    ]);
  });

  it("does not treat class property names or unannotated member type parameters as bindings", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        Map = "property name only";
        private values = new Map<string, string>();
        valuesView<Map>() {
          return this.values;
        }
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toMatchObject({
      fieldName: "values",
      mutableFamily: "Map",
    });
  });

  it("collects module var bindings through control flow without entering nested scopes", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      if (enabled) {
        var Map = CustomMap;
      }
      function localScope() { var Set = CustomSet; }
      class LocalClass { method() { var WeakMap = CustomWeakMap; } }
      namespace LocalModule { export var WeakSet = CustomWeakSet; }

      export class Store {
        private map = new Map();
        private set = new Set();
        private weakMap = new WeakMap();
        private weakSet = new WeakSet();
        mapView() { return this.map; }
        setView() { return this.set; }
        weakMapView() { return this.weakMap; }
        weakSetView() { return this.weakSet; }
      }
      `,
    );

    expect(findings.map((finding) => finding.metadata.mutableFamily)).toEqual([
      "Set",
      "WeakMap",
      "WeakSet",
    ]);
  });

  const negativeCases = [
    {
      name: "a non-exported class",
      source: `
        class Store {
          private items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a decorated exported class",
      source: `
        @sealed
        export class Store {
          private items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an exported class expression",
      source: `
        export const Store = class {
          private items: string[] = [];
          itemsView() { return this.items; }
        };
      `,
    },
    {
      name: "a CommonJS export assignment",
      source: `
        class Store {
          private items: string[] = [];
          itemsView() { return this.items; }
        }
        export = Store;
      `,
    },
    {
      name: "a type-only local export",
      source: `
        class Store {
          private items: string[] = [];
          itemsView() { return this.items; }
        }
        export type { Store };
      `,
    },
    {
      name: "an external re-export that shares a local class name",
      source: `
        class Store {
          private items: string[] = [];
          itemsView() { return this.items; }
        }
        export { Store } from "./other-store";
      `,
    },
    {
      name: "a nested class",
      source: `
        export function makeStore() {
          class Store {
            private items: string[] = [];
            itemsView() { return this.items; }
          }
          return Store;
        }
      `,
    },
    {
      name: "a public field",
      source: `
        export class Store {
          items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a protected field",
      source: `
        export class Store {
          protected items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a static field",
      source: `
        export class Store {
          private static items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an optional field",
      source: `
        export class Store {
          private items?: string[];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a declared field",
      source: `
        export class Store {
          declare private items: string[];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a decorated field",
      source: `
        export class Store {
          @observable private items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a computed field",
      source: `
        export class Store {
          private ["items"]: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a constructor parameter property",
      source: `
        export class Store {
          constructor(private items: string[]) {}
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an inherited field",
      source: `
        class BaseStore {
          protected items: string[] = [];
        }
        export class Store extends BaseStore {
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an abstract property",
      source: `
        export abstract class Store {
          private abstract items: string[];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an auto-accessor property",
      source: `
        export class Store {
          private accessor items: string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a readonly array annotation",
      source: `
        export class Store {
          private items: readonly string[] = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a ReadonlyArray annotation",
      source: `
        export class Store {
          private items: ReadonlyArray<string> = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a ReadonlyMap annotation",
      source: `
        export class Store {
          private items: ReadonlyMap<string, string> = new Map();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a ReadonlySet annotation",
      source: `
        export class Store {
          private items: ReadonlySet<string> = new Set();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an aliased annotation",
      source: `
        type Items = string[];
        export class Store {
          private items: Items = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a union annotation",
      source: `
        export class Store {
          private items: string[] | Set<string> = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an intersection annotation",
      source: `
        export class Store {
          private items: string[] & { tagged: true } = [] as never;
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a tuple annotation",
      source: `
        export class Store {
          private items: [string] = ["ready"];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an object keyword annotation",
      source: `
        export class Store {
          private items: object = {};
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a custom collection annotation",
      source: `
        export class Store {
          private items: Bag<string>;
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a Readonly wrapper annotation",
      source: `
        export class Store {
          private items: Readonly<Map<string, string>> = new Map();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an unknown annotation despite a mutable initializer",
      source: `
        export class Store {
          private items: unknown = [];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an assertion-wrapped initializer",
      source: `
        export class Store {
          private items = [] as string[];
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a called built-in initializer",
      source: `
        export class Store {
          private items = Array<string>();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a factory initializer",
      source: `
        export class Store {
          private items = createItems();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an aliased initializer",
      source: `
        const sharedItems: string[] = [];
        export class Store {
          private items = sharedItems;
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a qualified built-in constructor",
      source: `
        export class Store {
          private items = new globalThis.Map();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an empty type literal",
      source: `
        export class Store {
          private items: {} = {};
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a readonly-only type literal",
      source: `
        export class Store {
          private items: { readonly value: string } = { value: "ready" };
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a readonly-index-only type literal",
      source: `
        export class Store {
          private items: { readonly [key: string]: number } = {};
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a getter-only type literal",
      source: `
        export class Store {
          private items: { get value(): string };
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a call-signature-only type literal",
      source: `
        export class Store {
          private items: { (): void };
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an imported built-in name",
      source: `
        import { Map } from "./custom-map";
        export class Store {
          private items = new Map();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a declared built-in name",
      source: `
        class Set<T> {}
        export class Store {
          private items = new Set<string>();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a value declaration shadowing a type-space built-in",
      source: `
        const WeakMap = 1;
        export class Store {
          private items: WeakMap<object, object>;
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a type declaration shadowing a value-space built-in",
      source: `
        type WeakSet<T> = { add(value: T): void };
        export class Store {
          private items = new WeakSet<object>();
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a class type parameter shadowing a built-in",
      source: `
        export class Store<Map> {
          private items: Map<string, string>;
          itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a member type parameter shadowing an explicit return built-in",
      source: `
        export class Store {
          private items = new Map<string, string>();
          itemsView<Map>(): Map<string, string> { return this.items; }
        }
      `,
    },
    {
      name: "a private exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          private itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a protected exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          protected itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a static exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          static itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a parameterized exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView(unused: boolean) { return this.items; }
        }
      `,
    },
    {
      name: "an async exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          async itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a generator exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          *itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "a decorated exposing method",
      source: `
        export class Store {
          private items: string[] = [];
          @memoized itemsView() { return this.items; }
        }
      `,
    },
    {
      name: "an assertion-wrapped return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() { return this.items as string[]; }
        }
      `,
    },
    {
      name: "an aliased return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() {
            const result = this.items;
            return result;
          }
        }
      `,
    },
    {
      name: "a callback return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() { return () => this.items; }
        }
      `,
    },
    {
      name: "a wrapper return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() { return Object.freeze(this.items); }
        }
      `,
    },
    {
      name: "an array copy return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() { return [...this.items]; }
        }
      `,
    },
    {
      name: "an object copy return",
      source: `
        export class Store {
          private state = { ready: true };
          stateView() { return { ...this.state }; }
        }
      `,
    },
    {
      name: "a projection return",
      source: `
        export class Store {
          private state = { items: [] };
          itemsView() { return this.state.items; }
        }
      `,
    },
    {
      name: "an iterator return",
      source: `
        export class Store {
          private items = new Set<string>();
          itemsView() { return this.items.values(); }
        }
      `,
    },
    {
      name: "an optional-chain return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() { return this?.items; }
        }
      `,
    },
    {
      name: "a computed-access return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() { return this["items"]; }
        }
      `,
    },
    {
      name: "a return accompanied by another statement",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() {
            audit();
            return this.items;
          }
        }
      `,
    },
    {
      name: "a return accompanied by another return",
      source: `
        export class Store {
          private items: string[] = [];
          itemsView() {
            if (ready) return this.items;
            return this.items;
          }
        }
      `,
    },
    {
      name: "a mismatched mutable return family",
      source: `
        export class Store {
          private items = new Map<string, string>();
          itemsView(): Set<string> { return this.items; }
        }
      `,
    },
    {
      name: "a readonly return annotation",
      source: `
        export class Store {
          private items = new Map<string, string>();
          itemsView(): ReadonlyMap<string, string> { return this.items; }
        }
      `,
    },
    {
      name: "a custom return annotation",
      source: `
        export class Store {
          private items = new Map<string, string>();
          itemsView(): CustomMap<string, string> { return this.items; }
        }
      `,
    },
  ];

  for (const testCase of negativeCases) {
    it(`ignores ${testCase.name}`, () => {
      expect(runSingle(detectExposedMutableRepresentation, testCase.source)).toEqual([]);
    });
  }

  it("ignores otherwise matching sources in test-only and generated paths", () => {
    const source = `
      export class Store {
        private items: string[] = [];
        itemsView() { return this.items; }
      }
    `;

    expect(runSingle(detectExposedMutableRepresentation, source, "test/store.test.ts")).toEqual([]);
    expect(runSingle(detectExposedMutableRepresentation, source, "src/generated/store.ts")).toEqual(
      [],
    );
  });

  it("suppresses only the same-name overloaded member", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private hidden = new Map<string, string>();
        private exposed = new Set<string>();

        hiddenView(): ReadonlyMap<string, string>;
        hiddenView(): Map<string, string> { return this.hidden; }
        exposedView(): Set<string> { return this.exposed; }
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toMatchObject({
      fieldName: "exposed",
      accessors: [{ name: "exposedView", kind: "method", line: 7 }],
    });
  });

  it("suppresses an implementation with a computed string-literal overload signature", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private items = new Map<string, string>();
        ["itemsView"](): ReadonlyMap<string, string>;
        itemsView(): Map<string, string> { return this.items; }
      }
      `,
    );

    expect(findings).toEqual([]);
  });

  it("normalizes static template overload names without resolving dynamic templates", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      const prefix = "hidden";
      export class Store {
        private hidden = new Map<string, string>();
        private exposed = new Set<string>();
        [\`hiddenView\`](): ReadonlyMap<string, string>;
        hiddenView(): Map<string, string> { return this.hidden; }
        [\`\${prefix}View\`](): ReadonlySet<string>;
        View(): Set<string> { return this.exposed; }
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata).toMatchObject({
      fieldName: "exposed",
      accessors: [{ name: "View", kind: "method", line: 8 }],
    });
  });

  it("does not let a private-identifier overload suppress a same-spelled public member", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private items = new Map<string, string>();
        #itemsView(): ReadonlyMap<string, string>;
        #itemsView(): ReadonlyMap<string, string> { return this.items; }
        itemsView(): Map<string, string> { return this.items; }
      }
      `,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].metadata.accessors).toEqual([
      { name: "itemsView", kind: "method", line: 5 },
    ]);
  });

  it("emits one finding per exposed field rather than per exposing member", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Store {
        private items: string[] = [];
        private tags = new Set<string>();
        itemsView() { return this.items; }
        get itemsReference() { return this.items; }
        tagsView() { return this.tags; }
      }
      `,
    );

    expect(findings).toHaveLength(2);
    expect(
      findings
        .map((finding) => [
          finding.metadata.fieldName,
          (finding.metadata.accessors as unknown[]).length,
        ])
        .sort(),
    ).toEqual([
      ["items", 2],
      ["tags", 1],
    ]);
  });

  it("emits exact boundary and metadata for all exposing members", () => {
    const findings = runSingle(
      detectExposedMutableRepresentation,
      `
      export class Cache {
        private entries: Map<string, string> = new Map();

        entriesView(): Map<string, string> { return this.entries; }
        get entriesReference() { return this.entries; }
        entriesAgain() { return this.entries; }
      }
      `,
      "src/cache.ts",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      flag: "exposedMutableRepresentation",
      severity: "candidate",
      file: "src/cache.ts",
      line: 4,
      fingerprint: expect.stringMatching(/^strata:v1:/),
      message: expect.any(String),
    });
    expect(findings[0].metadata).toEqual({
      className: "Cache",
      fieldName: "entries",
      fieldLine: 2,
      mutableFamily: "Map",
      accessors: [
        { name: "entriesView", kind: "method", line: 4 },
        { name: "entriesReference", kind: "getter", line: 5 },
        { name: "entriesAgain", kind: "method", line: 6 },
      ],
    });
  });

  it("fingerprints only the file, class, field, and mutable family identity", () => {
    const source = `
      export class Store {
        private items: string[] = [];
        itemsView() { return this.items; }
      }
    `;
    const withAnotherAccessor = `
      export class Store {
        private items: string[] = [];
        itemsView() { return this.items; }
        get itemsReference() { return this.items; }
      }
    `;

    const base = runSingle(detectExposedMutableRepresentation, source)[0];
    const shifted = runSingle(
      detectExposedMutableRepresentation,
      withHarmlessLeadingComment(source),
    )[0];
    const changedAccessors = runSingle(detectExposedMutableRepresentation, withAnotherAccessor)[0];
    const changedFile = runSingle(detectExposedMutableRepresentation, source, "src/other.ts")[0];
    const changedClass = runSingle(
      detectExposedMutableRepresentation,
      source.replace("class Store", "class OtherStore"),
    )[0];
    const changedField = runSingle(
      detectExposedMutableRepresentation,
      source.replaceAll("items", "values"),
    )[0];
    const changedFamily = runSingle(
      detectExposedMutableRepresentation,
      source.replace("string[] = []", "Set<string> = new Set()"),
    )[0];

    expect(shifted.fingerprint).toBe(base.fingerprint);
    expect(changedAccessors.fingerprint).toBe(base.fingerprint);
    expect(
      new Set([
        base.fingerprint,
        changedFile.fingerprint,
        changedClass.fingerprint,
        changedField.fingerprint,
        changedFamily.fingerprint,
      ]).size,
    ).toBe(5);
  });
});
