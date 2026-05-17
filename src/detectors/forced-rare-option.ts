import { walk, type Ctx, type Node } from "../ast.ts";
import { createFinding } from "../finding.ts";
import { isNonReviewablePath } from "../skip-patterns.ts";
import {
  buildFileScope,
  createRelativeImportResolver,
  type ImportResolver,
  resolveDeclarationSite,
} from "../scope.ts";
import type { Finding } from "../types.ts";
import { exportDeclaration, localExportedNames } from "./export-surface.ts";

const MIN_CALLS_FOR_CONSENSUS = 3;
const CONSENSUS_RATIO = 0.8;

type ApiKind = "function" | "constructor";

type ObjectTypeIndex = Map<string, string[]>;
type ScopeIndex = Map<string, ReturnType<typeof buildFileScope>>;

type ApiParam = {
  index: number;
  name: string;
  optionKeys: string[];
};

type ApiDecl = {
  key: string;
  kind: ApiKind;
  name: string;
  file: string;
  line: number;
  params: ApiParam[];
};

type CallSite = {
  file: string;
  line: number;
  start: number;
  args: Node[];
};

type RareValue = {
  key: string;
  label: string;
  kind: string;
};

/**
 * Flags exported APIs whose call sites repeatedly spell out rarely varied choices.
 *
 * The detector intentionally owns both sides of the evidence: exported API shape
 * and project-local call sites. Keeping that cross-file work inside one detector
 * preserves `scanProject()` as the single deep scanner entry point.
 */
export function detectForcedRareOption(
  ctxs: Ctx[],
  imports: ImportResolver = createRelativeImportResolver(ctxs.map((ctx) => ctx.file)),
): Finding[] {
  const scopes = buildScopes(ctxs, imports);
  const objectTypes = collectObjectTypes(ctxs);
  const apis = collectExportedApis(ctxs, scopes, objectTypes);
  const callsByApi = collectCallSites(ctxs, scopes, apis);
  const findings: Finding[] = [];

  for (const api of apis.values()) {
    const callSites = callsByApi.get(api.key) ?? [];
    findings.push(...placeholderFindings(api, callSites));
    findings.push(...consensusFindings(api, callSites));
  }

  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function buildScopes(ctxs: Ctx[], imports: ImportResolver): ScopeIndex {
  const scopes: ScopeIndex = new Map();
  for (const ctx of ctxs) scopes.set(ctx.file, buildFileScope(ctx, imports));
  return scopes;
}

function collectObjectTypes(ctxs: Ctx[]): ObjectTypeIndex {
  const out: ObjectTypeIndex = new Map();
  for (const ctx of ctxs) {
    if (isNonReviewablePath(ctx.file)) continue;

    for (const statement of ctx.ast.body ?? []) {
      const declaration = topLevelDeclaration(statement);
      if (!declaration?.id?.name) continue;

      if (declaration.type === "TSInterfaceDeclaration") {
        const keys = typeMembersToKeys(declaration.body?.body ?? []);
        if (keys.length > 0) out.set(declarationKey(ctx.file, declaration.id.name), keys);
      } else if (declaration.type === "TSTypeAliasDeclaration") {
        const keys = typeLiteralKeys(declaration.typeAnnotation);
        if (keys.length > 0) out.set(declarationKey(ctx.file, declaration.id.name), keys);
      }
    }
  }
  return out;
}

function collectExportedApis(
  ctxs: Ctx[],
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
): Map<string, ApiDecl> {
  const out = new Map<string, ApiDecl>();

  for (const ctx of ctxs) {
    if (isNonReviewablePath(ctx.file)) continue;

    const exportedNames = localExportedNames(ctx.ast);
    for (const statement of ctx.ast.body ?? []) {
      const declaration = exportDeclaration(statement);
      if (declaration) recordDeclarationApi(declaration, ctx, scopes, objectTypes, out, true);

      if (statement.type === "FunctionDeclaration" && exportedNames.has(statement.id?.name)) {
        recordFunctionApi(statement, statement.id.name, ctx, scopes, objectTypes, out);
      } else if (statement.type === "ClassDeclaration" && exportedNames.has(statement.id?.name)) {
        recordClassConstructorApi(statement, statement.id.name, ctx, scopes, objectTypes, out);
      } else if (statement.type === "VariableDeclaration") {
        recordVariableApis(statement, ctx, scopes, objectTypes, out, exportedNames, false);
      }
    }
  }

  return out;
}

function recordDeclarationApi(
  declaration: Node,
  ctx: Ctx,
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
  out: Map<string, ApiDecl>,
  directlyExported: boolean,
): void {
  if (declaration.type === "FunctionDeclaration" && declaration.id?.name) {
    recordFunctionApi(declaration, declaration.id.name, ctx, scopes, objectTypes, out);
  } else if (
    (declaration.type === "ClassDeclaration" || declaration.type === "ClassExpression") &&
    declaration.id?.name
  ) {
    recordClassConstructorApi(declaration, declaration.id.name, ctx, scopes, objectTypes, out);
  } else if (declaration.type === "VariableDeclaration") {
    recordVariableApis(declaration, ctx, scopes, objectTypes, out, new Set(), directlyExported);
  }
}

function recordVariableApis(
  declaration: Node,
  ctx: Ctx,
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
  out: Map<string, ApiDecl>,
  exportedNames: Set<string | undefined>,
  directlyExported: boolean,
): void {
  for (const declarator of declaration.declarations ?? []) {
    const name = declarator.id?.type === "Identifier" ? declarator.id.name : null;
    if (!name || (!directlyExported && !exportedNames.has(name))) continue;

    const init = declarator.init;
    if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
      recordFunctionApi(init, name, ctx, scopes, objectTypes, out, declarator.start);
    } else if (init?.type === "ClassExpression") {
      recordClassConstructorApi(init, name, ctx, scopes, objectTypes, out);
    }
  }
}

function recordFunctionApi(
  fn: Node,
  name: string,
  ctx: Ctx,
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
  out: Map<string, ApiDecl>,
  lineStart = fn.start,
): void {
  const params = extractParams(fn.params ?? [], ctx.file, scopes, objectTypes);
  if (!isCandidateShape(params)) return;

  const key = declarationKey(ctx.file, name);
  out.set(key, {
    key,
    kind: "function",
    name,
    file: ctx.file,
    line: ctx.lineOf(lineStart),
    params,
  });
}

function recordClassConstructorApi(
  classNode: Node,
  name: string,
  ctx: Ctx,
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
  out: Map<string, ApiDecl>,
): void {
  const constructor = (classNode.body?.body ?? []).find(
    (member: Node) => member.type === "MethodDefinition" && member.kind === "constructor",
  );
  if (!constructor?.value?.params) return;

  const params = extractParams(constructor.value.params, ctx.file, scopes, objectTypes);
  if (!isCandidateShape(params)) return;

  const key = declarationKey(ctx.file, name);
  out.set(key, {
    key,
    kind: "constructor",
    name,
    file: ctx.file,
    line: ctx.lineOf(constructor.start),
    params,
  });
}

function extractParams(
  params: Node[],
  file: string,
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
): ApiParam[] {
  return params.map((rawParam, index) => {
    const param = unwrapParam(rawParam);
    return {
      index,
      name: paramName(param, index),
      optionKeys: optionKeysForParam(param, file, scopes, objectTypes),
    };
  });
}

function isCandidateShape(params: ApiParam[]): boolean {
  return params.length >= 3 || params.some((param) => param.optionKeys.length >= 5);
}

function collectCallSites(
  ctxs: Ctx[],
  scopes: ScopeIndex,
  apis: Map<string, ApiDecl>,
): Map<string, CallSite[]> {
  const out = new Map<string, CallSite[]>();

  for (const ctx of ctxs) {
    if (isNonReviewablePath(ctx.file)) continue;

    walk(ctx.ast, (node) => {
      if (node.type !== "CallExpression" && node.type !== "NewExpression") return;

      const api = resolveCalledApi(node, ctx.file, scopes, apis);
      if (!api) return;

      const list = out.get(api.key) ?? [];
      list.push({
        file: ctx.file,
        line: ctx.lineOf(node.start),
        start: node.start,
        args: node.arguments ?? [],
      });
      out.set(api.key, list);
    });
  }

  for (const list of out.values()) {
    list.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  }
  return out;
}

function resolveCalledApi(
  node: Node,
  file: string,
  scopes: ScopeIndex,
  apis: Map<string, ApiDecl>,
): ApiDecl | null {
  const name = node.callee?.type === "Identifier" ? node.callee.name : null;
  if (!name) return null;

  const site = resolveDeclarationSite(file, name, scopes);
  if (!site) return null;

  const api = apis.get(declarationKey(site.file, site.name));
  if (!api) return null;
  if (node.type === "NewExpression" && api.kind !== "constructor") return null;
  if (node.type === "CallExpression" && api.kind !== "function") return null;
  return api;
}

function placeholderFindings(api: ApiDecl, callSites: CallSite[]): Finding[] {
  if (api.params.length < 3) return [];

  const findings: Finding[] = [];
  for (const callSite of callSites) {
    const lastRealArg = lastNonPlaceholderArgIndex(callSite.args);
    const placeholderPositions: number[] = [];
    for (let index = 0; index < lastRealArg; index++) {
      if (isPlaceholderArg(callSite.args[index])) placeholderPositions.push(index);
    }
    if (placeholderPositions.length < 2) continue;

    findings.push(
      createFinding({
        flag: "forcedRareOption",
        file: callSite.file,
        line: callSite.line,
        message: `${api.name} call uses placeholder arguments at positions ${placeholderPositions.map((position) => position + 1).join(", ")} to reach later options - rare choices are exposed to common callers`,
        metadata: {
          apiName: api.name,
          apiKind: api.kind,
          declaration: { file: api.file, line: api.line },
          kind: "placeholderArgs",
          placeholderPositions,
          totalParams: api.params.length,
        },
        identity: [api.kind, api.name, "placeholderArgs", placeholderPositions],
      }),
    );
  }

  return findings;
}

function consensusFindings(api: ApiDecl, callSites: CallSite[]): Finding[] {
  if (callSites.length < MIN_CALLS_FOR_CONSENSUS) return [];

  const findings: Finding[] = [];
  const minimumRepeats = Math.ceil(callSites.length * CONSENSUS_RATIO);
  const positionalEligible = api.params.length >= 3;

  for (const param of api.params) {
    if (positionalEligible || param.optionKeys.length >= 5) {
      const repeatedValue = mostRepeatedValue(
        callSites
          .map((callSite) => ({ callSite, value: rareValue(callSite.args[param.index]) }))
          .filter((entry): entry is { callSite: CallSite; value: RareValue } => !!entry.value),
      );

      if (repeatedValue && repeatedValue.count >= minimumRepeats) {
        findings.push(parameterFinding(api, param, callSites.length, repeatedValue));
      }
    }

    if (param.optionKeys.length < 5) continue;
    const optionValues = new Map<string, Array<{ callSite: CallSite; value: RareValue }>>();
    for (const callSite of callSites) {
      for (const [optionName, value] of objectOptionValues(callSite.args[param.index])) {
        const list = optionValues.get(optionName) ?? [];
        list.push({ callSite, value });
        optionValues.set(optionName, list);
      }
    }

    for (const optionName of param.optionKeys) {
      const repeatedValue = mostRepeatedValue(optionValues.get(optionName) ?? []);
      if (!repeatedValue || repeatedValue.count < minimumRepeats) continue;
      findings.push(optionFinding(api, param, optionName, callSites.length, repeatedValue));
    }
  }

  return findings;
}

function parameterFinding(
  api: ApiDecl,
  param: ApiParam,
  callCount: number,
  repeated: RepeatedValue,
): Finding {
  return createFinding({
    flag: "forcedRareOption",
    file: api.file,
    line: api.line,
    message: `${api.name} callers pass ${repeated.value.label} for '${param.name}' in ${repeated.count}/${callCount} calls - hide the common case behind the API`,
    metadata: {
      apiName: api.name,
      apiKind: api.kind,
      kind: "parameter",
      parameterIndex: param.index,
      parameterName: param.name,
      value: repeated.value.label,
      valueKind: repeated.value.kind,
      repeatedCount: repeated.count,
      callCount,
      callSites: repeated.callSites.map(callSiteLocation),
    },
    identity: [api.kind, api.name, "parameter", param.index, param.name, repeated.value.key],
  });
}

function optionFinding(
  api: ApiDecl,
  param: ApiParam,
  optionName: string,
  callCount: number,
  repeated: RepeatedValue,
): Finding {
  return createFinding({
    flag: "forcedRareOption",
    file: api.file,
    line: api.line,
    message: `${api.name} callers pass ${repeated.value.label} for option '${optionName}' in ${repeated.count}/${callCount} calls - the option is probably a default`,
    metadata: {
      apiName: api.name,
      apiKind: api.kind,
      kind: "option",
      parameterIndex: param.index,
      parameterName: param.name,
      optionName,
      value: repeated.value.label,
      valueKind: repeated.value.kind,
      repeatedCount: repeated.count,
      callCount,
      callSites: repeated.callSites.map(callSiteLocation),
    },
    identity: [
      api.kind,
      api.name,
      "option",
      param.index,
      param.name,
      optionName,
      repeated.value.key,
    ],
  });
}

type RepeatedValue = {
  value: RareValue;
  count: number;
  callSites: CallSite[];
};

function mostRepeatedValue(
  entries: Array<{ callSite: CallSite; value: RareValue }>,
): RepeatedValue | null {
  const byValue = new Map<string, RepeatedValue>();
  for (const entry of entries) {
    const current = byValue.get(entry.value.key) ?? {
      value: entry.value,
      count: 0,
      callSites: [],
    };
    current.count += 1;
    current.callSites.push(entry.callSite);
    byValue.set(entry.value.key, current);
  }

  return (
    [...byValue.values()].sort(
      (a, b) => b.count - a.count || a.value.key.localeCompare(b.value.key),
    )[0] ?? null
  );
}

function callSiteLocation(callSite: CallSite): { file: string; line: number } {
  return { file: callSite.file, line: callSite.line };
}

function objectOptionValues(arg: Node | undefined): Map<string, RareValue> {
  const out = new Map<string, RareValue>();
  if (arg?.type !== "ObjectExpression") return out;

  for (const property of arg.properties ?? []) {
    const name = objectPropertyName(property);
    if (!name) continue;
    const value = rareValue(property.value);
    if (value) out.set(name, value);
  }
  return out;
}

function rareValue(node: Node | undefined): RareValue | null {
  if (!node) return null;
  if (node.type === "Identifier") {
    if (node.name === "undefined")
      return { key: "undefined", label: "undefined", kind: "undefined" };
    if (isDefaultLikeIdentifier(node.name)) {
      return { key: `default:${node.name}`, label: node.name, kind: "defaultIdentifier" };
    }
    return null;
  }
  if (node.type === "Literal") {
    if (node.value === null) return { key: "null", label: "null", kind: "null" };
    if (typeof node.value === "string") {
      return {
        key: `string:${JSON.stringify(node.value)}`,
        label: JSON.stringify(node.value),
        kind: "literal",
      };
    }
    if (typeof node.value === "number" || typeof node.value === "boolean") {
      return {
        key: `${typeof node.value}:${String(node.value)}`,
        label: String(node.value),
        kind: "literal",
      };
    }
  }
  if (node.type === "TemplateLiteral" && (node.expressions?.length ?? 0) === 0) {
    const value = node.quasis?.[0]?.value?.cooked ?? "";
    return {
      key: `string:${JSON.stringify(value)}`,
      label: JSON.stringify(value),
      kind: "literal",
    };
  }
  if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")) {
    const inner = rareValue(node.argument);
    if (inner?.kind === "literal") {
      return {
        key: `${node.operator}${inner.key}`,
        label: `${node.operator}${inner.label}`,
        kind: "literal",
      };
    }
  }
  if (node.type === "ObjectExpression" && (node.properties?.length ?? 0) === 0) {
    return { key: "emptyObject", label: "{}", kind: "emptyObject" };
  }
  if (node.type === "ArrayExpression" && (node.elements?.length ?? 0) === 0) {
    return { key: "emptyArray", label: "[]", kind: "emptyArray" };
  }
  return null;
}

function isPlaceholderArg(node: Node | undefined): boolean {
  const value = rareValue(node);
  return value?.kind === "undefined" || value?.kind === "null";
}

function lastNonPlaceholderArgIndex(args: Node[]): number {
  for (let index = args.length - 1; index >= 0; index--) {
    if (!isPlaceholderArg(args[index])) return index;
  }
  return -1;
}

function isDefaultLikeIdentifier(name: string): boolean {
  return /^(default|defaults|empty|none|noop)$/i.test(name) || /^default[A-Z_]/.test(name);
}

function optionKeysForParam(
  param: Node,
  file: string,
  scopes: ScopeIndex,
  objectTypes: ObjectTypeIndex,
): string[] {
  if (param.type === "ObjectPattern") return patternKeys(param.properties ?? []);

  const typeNode = param.typeAnnotation?.typeAnnotation;
  if (!typeNode) return [];
  if (typeNode.type === "TSTypeLiteral") return typeLiteralKeys(typeNode);
  if (typeNode.type !== "TSTypeReference") return [];

  const typeName = typeReferenceName(typeNode);
  if (!typeName) return [];
  const site = resolveDeclarationSite(file, typeName, scopes);
  return site ? (objectTypes.get(declarationKey(site.file, site.name)) ?? []) : [];
}

function typeReferenceName(node: Node): string | null {
  return node.typeName?.type === "Identifier" ? node.typeName.name : null;
}

function typeLiteralKeys(node: Node | null): string[] {
  if (node?.type !== "TSTypeLiteral") return [];
  return typeMembersToKeys(node.members ?? []);
}

function typeMembersToKeys(members: Node[]): string[] {
  return members
    .map((member) => objectPropertyName(member))
    .filter((name): name is string => !!name)
    .sort();
}

function patternKeys(properties: Node[]): string[] {
  return properties
    .map((property) => objectPropertyName(property.key ? property : property.argument))
    .filter((name): name is string => !!name)
    .sort();
}

function objectPropertyName(node: Node | undefined): string | null {
  const key = node?.key ?? node;
  if (key?.type === "Identifier") return key.name;
  if (key?.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

function unwrapParam(param: Node): Node {
  if (param.type === "TSParameterProperty") return unwrapParam(param.parameter);
  if (param.type === "AssignmentPattern") return unwrapParam(param.left);
  return param;
}

function paramName(param: Node, index: number): string {
  if (param.type === "Identifier") return param.name;
  if (param.type === "RestElement" && param.argument?.type === "Identifier")
    return param.argument.name;
  if (param.type === "ObjectPattern") return `options${index + 1}`;
  return `param${index + 1}`;
}

function topLevelDeclaration(statement: Node): Node | null {
  return statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration"
    ? (statement.declaration ?? null)
    : statement;
}

function declarationKey(file: string, name: string): string {
  return `${file}:${name}`;
}
