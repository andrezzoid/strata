import type { Ctx, Node, SingleDetector } from "../ast.ts";
import { walk } from "../ast.ts";
import type { Finding } from "../types.ts";

// Thresholds chosen during source-tool calibration for high recall without turning every small file into noise.
const SHALLOW_RATIO = 0.3;
const SHALLOW_MIN_BODY = 3;
const SHALLOW_MIN_SURFACE = 2;
const WIDE_MIN_EXPORTS = 10;
const WIDE_SIGNATURE_MAX = 4;
const GENERIC_SUFFIXES = [
  "Manager",
  "Helper",
  "Wrapper",
  "Container",
  "Holder",
  "Utils",
  "Util",
  "Misc",
  "Common",
  "Processor",
  "Handler",
];

// Counts API surface against non-blank/non-comment/non-import body lines. Public
// class members count because they are part of the caller-facing surface.
function detectShallowModule({ file, source, ast }: Ctx): Finding[] {
  let surface = 0;
  for (const stmt of ast.body) {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const d = stmt.declaration;
        if (d.type === "ClassDeclaration") {
          surface += 1;
          for (const member of d.body?.body ?? []) {
            if (member.type !== "MethodDefinition" && member.type !== "PropertyDefinition") continue;
            const isPrivate =
              member.accessibility === "private" ||
              (typeof member.key?.name === "string" && member.key.name.startsWith("_"));
            if (!isPrivate) surface += 1;
          }
        } else if (d.type === "VariableDeclaration") {
          surface += d.declarations?.length ?? 0;
        } else {
          surface += 1;
        }
      }
      if (stmt.specifiers) surface += stmt.specifiers.length;
    } else if (stmt.type === "ExportDefaultDeclaration") {
      surface += 1;
    } else if (stmt.type === "ExportAllDeclaration") {
      surface += 1;
    }
  }

  let body = 0;
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    if (/^import[\s{*]/.test(trimmed)) continue;
    body += 1;
  }

  if (body < SHALLOW_MIN_BODY || surface < SHALLOW_MIN_SURFACE) return [];
  if (surface / body <= SHALLOW_RATIO) return [];

  return [
    {
      flag: "shallowModule",
      severity: "candidate",
      file,
      line: 1,
      message: `${surface} surface elements / ${body} body lines — interface heavy relative to implementation`,
      metadata: { surface, bodyLines: body },
    },
  ];
}

// PoSD Ch. 7: a class method delegating to instance state with no logic. Free
// functions are excluded because they can be useful naming/type abstractions.
function detectPassThroughMethod({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "MethodDefinition") return;
    if (node.kind === "constructor") return;

    const fn = node.value;
    if (!fn?.body?.body || fn.body.body.length !== 1) return;

    const paramNames: string[] = [];
    for (const param of fn.params ?? []) {
      if (param.type === "Identifier") paramNames.push(param.name);
      else if (param.type === "TSParameterProperty" && param.parameter?.type === "Identifier") {
        paramNames.push(param.parameter.name);
      } else {
        return;
      }
    }

    const stmt = fn.body.body[0];
    let call: Node | null = null;
    if (stmt.type === "ReturnStatement" && stmt.argument?.type === "CallExpression") {
      call = stmt.argument;
    } else if (stmt.type === "ExpressionStatement" && stmt.expression?.type === "CallExpression") {
      call = stmt.expression;
    }
    if (!call || call.callee?.type !== "MemberExpression") return;

    const obj = call.callee.object;
    const isThisRooted =
      obj?.type === "ThisExpression" ||
      (obj?.type === "MemberExpression" && obj.object?.type === "ThisExpression");
    if (!isThisRooted) return;

    if ((call.arguments?.length ?? 0) !== paramNames.length) return;
    for (let i = 0; i < paramNames.length; i++) {
      const arg = call.arguments[i];
      if (arg.type !== "Identifier" || arg.name !== paramNames[i]) return;
    }

    findings.push({
      flag: "passThroughMethod",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "class method delegates to instance state with same args — layer without logic",
      metadata: {},
    });
  });
  return findings;
}

// Param whose every body reference is in argument position of a call. The
// detector only fires when several parameters travel together, matching the
// plumbing-layer pattern rather than incidental one-off forwarding.
function detectPassThroughVariable({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    let fn: Node | null = null;
    if (node.type === "FunctionDeclaration") fn = node;
    else if (node.type === "MethodDefinition") fn = node.value;
    else return;
    if (!fn?.body?.body) return;
    if ((fn.params?.length ?? 0) < 3) return;
    if (fn.body.body.length < 2) return;

    const passThroughParams: string[] = [];
    for (const param of fn.params ?? []) {
      if (param.type !== "Identifier") continue;
      const name: string = param.name;

      let usageCount = 0;
      let nonForwardingFound = false;
      walk(fn.body, (id, parent) => {
        if (id.type !== "Identifier" || id.name !== name) return;
        usageCount += 1;
        const isForwarding =
          parent?.type === "CallExpression" &&
          Array.isArray(parent.arguments) &&
          parent.arguments.includes(id);
        if (!isForwarding) nonForwardingFound = true;
      });

      if (usageCount > 0 && !nonForwardingFound) passThroughParams.push(name);
    }

    if (passThroughParams.length < 3) return;

    findings.push({
      flag: "passThroughVariable",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: `${passThroughParams.length} pass-through params (${passThroughParams.join(", ")}) — plumbing layer with no use of forwarded values`,
      metadata: { passThroughParams },
    });
  });
  return findings;
}

function detectEmptyCatch({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || (node.body.body?.length ?? 0) > 0) return;
    findings.push({
      flag: "emptyCatch",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "catch body has no executable statement",
      metadata: {},
    });
  });
  return findings;
}

function detectCatchRethrow({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || node.body.body?.length !== 1) return;
    const stmt = node.body.body[0];
    if (stmt.type !== "ThrowStatement" || stmt.argument?.type !== "Identifier") return;
    if (node.param?.type === "Identifier" && node.param.name !== stmt.argument.name) return;
    findings.push({
      flag: "catchRethrow",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "catch body is a pure rethrow",
      metadata: {},
    });
  });
  return findings;
}

function detectGenericNaming({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const genericSuffix = new RegExp(`(${GENERIC_SUFFIXES.join("|")})$`);
  walk(ast, (node) => {
    let id: Node | null = null;
    if (
      (node.type === "ClassDeclaration" || node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration") &&
      node.id
    ) {
      id = node.id;
    }
    if (!id?.name) return;
    if (!genericSuffix.test(id.name)) return;
    findings.push({
      flag: "genericNaming",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: `name '${id.name}' uses a generic suffix (Manager/Helper/Utils/...)`,
      metadata: { name: id.name },
    });
  });
  return findings;
}

function detectTsEscapeHatches({ file, ast, comments, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "TSAsExpression") return;
    if (node.typeAnnotation?.type !== "TSAnyKeyword") return;
    findings.push({
      flag: "tsEscapeHatch",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "TS escape hatch (`as any`)",
      metadata: { kind: "asAny" },
    });
  });
  for (const comment of comments) {
    const value = comment.value.trim();
    if (!/^@ts-(ignore|expect-error)\b/.test(value)) continue;
    findings.push({
      flag: "tsEscapeHatch",
      severity: "candidate",
      file,
      line: lineOf(comment.start),
      message: "TS escape hatch (`@ts-ignore` / `@ts-expect-error`)",
      metadata: { kind: value.split(/\s/)[0] },
    });
  }
  return findings;
}

function detectWideModule({ file, ast }: Ctx): Finding[] {
  let exports = 0;
  for (const stmt of ast.body) {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration?.declarations) exports += stmt.declaration.declarations.length;
      else if (stmt.declaration) exports += 1;
      if (stmt.specifiers) exports += stmt.specifiers.length;
    } else if (stmt.type === "ExportDefaultDeclaration") {
      exports += 1;
    } else if (stmt.type === "ExportAllDeclaration") {
      exports += 1;
    }
  }
  if (exports <= WIDE_MIN_EXPORTS) return [];
  return [
    {
      flag: "wideModule",
      severity: "candidate",
      file,
      line: 1,
      message: `${exports} top-level exports — wide module surface`,
      metadata: { exports },
    },
  ];
}

function detectWideSignature({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    let fn: Node | null = null;
    let nameForMsg = "";
    if (node.type === "FunctionDeclaration") {
      fn = node;
      nameForMsg = node.id?.name ?? "<anonymous>";
    } else if (node.type === "MethodDefinition") {
      fn = node.value;
      const key = node.key?.name ?? node.key?.value ?? "<anonymous>";
      nameForMsg = node.kind === "constructor" ? "constructor" : `method ${key}`;
    } else {
      return;
    }
    if (!fn?.params) return;

    let required = 0;
    for (const param of fn.params) {
      if (param.type === "Identifier" && !param.optional) required += 1;
      else if (param.type === "TSParameterProperty") {
        const inner = param.parameter;
        if (inner?.type === "Identifier" && !inner.optional) required += 1;
      }
    }

    if (required <= WIDE_SIGNATURE_MAX) return;
    findings.push({
      flag: "wideSignature",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: `${nameForMsg} takes ${required} required parameters — wide surface, consider an options object or splitting`,
      metadata: { name: nameForMsg, requiredParams: required },
    });
  });
  return findings;
}

export const SINGLE_DETECTORS: SingleDetector[] = [
  detectShallowModule,
  detectPassThroughMethod,
  detectPassThroughVariable,
  detectEmptyCatch,
  detectCatchRethrow,
  detectGenericNaming,
  detectTsEscapeHatches,
  detectWideModule,
  detectWideSignature,
];
