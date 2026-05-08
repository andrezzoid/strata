import type { Ctx, Node } from "../ast.ts";
import { GENERATED_PATH_PATTERN, TEST_FILE_PATTERN } from "../skip-patterns.ts";
import type { Finding } from "../types.ts";

// Agents tend to redeclare instead of reusing. Tracking declarations rather
// than usages keeps the signal concentrated on duplicated design decisions.
const DUP_MIN_OCCURRENCES_DEFAULT = 2;
const DUP_MIN_OCCURRENCES_BY_KIND: Record<string, number> = {
  class: 3,
  interface: 3,
  type: 3,
};
const DUP_CONST_MIN_STRING_LENGTH = 5;
const DUP_CONST_TRIVIAL_NUMBERS = new Set([-1, 0, 1, 2]);
const DUP_FN_MAX_PARAMS = 8;
const DUP_FN_MAX_STATEMENTS = 12;

type SymbolKind = "const" | "function" | "class" | "interface" | "type" | "enum";
type SymbolDecl = {
  kind: SymbolKind;
  name: string;
  fingerprint: string;
  file: string;
  line: number;
  start: number;
  end: number;
};

const PREVIEW_MAX_CHARS = 240;

function previewSource(source: string, start: number, end: number): string {
  let snippet = source.slice(start, end);
  if (snippet.length > PREVIEW_MAX_CHARS) {
    snippet = snippet.slice(0, PREVIEW_MAX_CHARS).replace(/\s+\S*$/, "") + " …";
  }
  return snippet;
}

// djb2: stable non-cryptographic grouping key for messages and metadata.
function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

function fingerprintConstValue(node: Node, name: string): string | null {
  const fingerprint = constValueRaw(node);
  if (!fingerprint) return null;
  if (fingerprint === "b:true" || fingerprint === "b:false") return null;
  if (fingerprint.startsWith("n:")) {
    const numberValue = Number(fingerprint.slice(2));
    if (DUP_CONST_TRIVIAL_NUMBERS.has(numberValue)) return null;
  }
  if (fingerprint.startsWith("s:")) {
    const stringValue = JSON.parse(fingerprint.slice(2));
    if (typeof stringValue !== "string" || stringValue.length < DUP_CONST_MIN_STRING_LENGTH) return null;
  }
  const isPrimitive = /^[+-]?[snb]:/.test(fingerprint);
  if (isPrimitive) return `name:${name}|${fingerprint}`;
  return fingerprint;
}

function constValueRaw(node: Node): string | null {
  if (!node) return null;
  if (node.type === "Literal") {
    if (typeof node.value === "string") return `s:${JSON.stringify(node.value)}`;
    if (typeof node.value === "number") return `n:${node.value}`;
    if (typeof node.value === "boolean") return `b:${node.value}`;
    return null;
  }
  if (node.type === "TemplateLiteral" && (node.expressions?.length ?? 0) === 0) {
    const value = node.quasis?.[0]?.value?.cooked ?? "";
    return `s:${JSON.stringify(value)}`;
  }
  if (node.type === "UnaryExpression" && (node.operator === "-" || node.operator === "+")) {
    const inner = constValueRaw(node.argument);
    if (!inner) return null;
    return `${node.operator}${inner}`;
  }
  if (node.type === "ArrayExpression") {
    const elements: string[] = [];
    for (const element of node.elements ?? []) {
      if (!element) return null;
      const fingerprint = constValueRaw(element);
      if (!fingerprint) return null;
      elements.push(fingerprint);
    }
    return `arr[${elements.join(",")}]`;
  }
  if (node.type === "ObjectExpression") {
    const entries: string[] = [];
    for (const prop of node.properties ?? []) {
      if (prop.type !== "Property") return null;
      let key: string;
      if (prop.key?.type === "Identifier") key = prop.key.name;
      else if (prop.key?.type === "Literal" && typeof prop.key.value === "string") key = prop.key.value;
      else return null;
      const value = constValueRaw(prop.value);
      if (!value) return null;
      entries.push(`${key}=${value}`);
    }
    entries.sort();
    return `obj{${entries.join(",")}}`;
  }
  return null;
}

const NORMALIZE_SKIP_KEYS = new Set([
  "loc",
  "range",
  "start",
  "end",
  "decorators",
  "typeAnnotation",
  "typeParameters",
  "returnType",
  "computed",
  "optional",
  "static",
  "async",
  "generator",
  "definite",
  "declare",
  "abstract",
  "readonly",
  "accessibility",
  "implements",
  "superTypeArguments",
]);

function normalizeAst(node: Node | null): string {
  if (!node || typeof node !== "object") return "";
  const type = node.type;
  if (typeof type !== "string") return "";
  if (type.startsWith("TS") && type !== "TSAsExpression" && type !== "TSNonNullExpression") return "";

  if (type === "Identifier") return "$id";
  if (type === "PrivateIdentifier") return "$pid";
  if (type === "Literal") {
    if (typeof node.value === "string") return "$str";
    if (typeof node.value === "number") return "$num";
    if (typeof node.value === "boolean") return "$bool";
    if (node.value === null) return "$null";
    return "$lit";
  }
  if (type === "TemplateLiteral") return `Tpl(${node.expressions?.length ?? 0})`;
  if (type === "ThisExpression") return "$this";
  if (type === "Super") return "$super";

  if (type === "MemberExpression") {
    const object = normalizeAst(node.object);
    let property: string;
    if (node.computed) property = `[${normalizeAst(node.property)}]`;
    else if (node.property?.type === "Identifier") property = `.${node.property.name}`;
    else if (node.property?.type === "PrivateIdentifier") property = `.#${node.property.name}`;
    else property = ".?";
    return `Member(${object}${property})`;
  }

  if (type === "CallExpression") {
    const callee = node.callee;
    const calleeText = callee?.type === "Identifier" ? `id:${callee.name}` : normalizeAst(callee);
    const args = (node.arguments ?? []).map(normalizeAst).join(",");
    return `Call(${calleeText},[${args}])`;
  }

  if (type === "NewExpression") {
    const callee = node.callee;
    const calleeText = callee?.type === "Identifier" ? `id:${callee.name}` : normalizeAst(callee);
    const args = (node.arguments ?? []).map(normalizeAst).join(",");
    return `New(${calleeText},[${args}])`;
  }

  const parts: string[] = [type, "("];
  for (const key of Object.keys(node)) {
    if (NORMALIZE_SKIP_KEYS.has(key) || key === "type") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      parts.push("[", value.map(normalizeAst).filter(Boolean).join(","), "]");
    } else if (value && typeof value === "object") {
      parts.push(normalizeAst(value));
    } else if (value != null && (key === "operator" || key === "kind" || key === "prefix")) {
      parts.push(`@${key}=${value}`);
    }
  }
  parts.push(")");
  return parts.join("");
}

function fingerprintFunction(fn: Node): string | null {
  const params = fn.params ?? [];
  if (params.length > DUP_FN_MAX_PARAMS) return null;
  const body = fn.body;
  if (!body) return null;
  if (body.type === "BlockStatement") {
    const statements = body.body ?? [];
    if (statements.length === 0 || statements.length > DUP_FN_MAX_STATEMENTS) return null;
    return `fn/${params.length}:${normalizeAst(body)}`;
  }
  return `fn/${params.length}=>${normalizeAst(body)}`;
}

function fingerprintClass(cls: Node): string | null {
  const members = cls.body?.body ?? [];
  if (members.length === 0) return null;
  const memberFingerprints: string[] = [];
  for (const member of members) {
    const name =
      member.key?.type === "Identifier" ? member.key.name :
      member.key?.type === "Literal" ? String(member.key.value) :
      "?";
    if (member.type === "MethodDefinition") {
      const fingerprint = fingerprintFunction(member.value);
      if (fingerprint) memberFingerprints.push(`m:${name}=${fingerprint}`);
    } else if (member.type === "PropertyDefinition") {
      const initFingerprint = member.value ? (constValueRaw(member.value) ?? `expr:${normalizeAst(member.value)}`) : "uninit";
      memberFingerprints.push(`p:${name}=${initFingerprint}`);
    }
  }
  if (memberFingerprints.length === 0) return null;
  memberFingerprints.sort();
  const superName = cls.superClass?.type === "Identifier" ? cls.superClass.name : "";
  return `cls(super=${superName}):[${memberFingerprints.join("|")}]`;
}

function isBarePrimitiveType(node: Node): boolean {
  if (!node) return false;
  const primitiveKinds = new Set([
    "TSStringKeyword",
    "TSNumberKeyword",
    "TSBooleanKeyword",
    "TSBigIntKeyword",
    "TSAnyKeyword",
    "TSUnknownKeyword",
    "TSNeverKeyword",
    "TSVoidKeyword",
    "TSUndefinedKeyword",
    "TSNullKeyword",
  ]);
  if (primitiveKinds.has(node.type)) return true;
  if (node.type === "TSIntersectionType" && Array.isArray(node.types)) {
    return node.types.some((member: Node) => primitiveKinds.has(member.type));
  }
  return false;
}

function fingerprintTypeNode(node: Node | null): string {
  if (!node || typeof node !== "object") return "";
  const type = node.type;
  if (typeof type !== "string") return "";

  switch (type) {
    case "TSStringKeyword": return "kw:string";
    case "TSNumberKeyword": return "kw:number";
    case "TSBooleanKeyword": return "kw:boolean";
    case "TSAnyKeyword": return "kw:any";
    case "TSUnknownKeyword": return "kw:unknown";
    case "TSNeverKeyword": return "kw:never";
    case "TSVoidKeyword": return "kw:void";
    case "TSNullKeyword": return "kw:null";
    case "TSUndefinedKeyword": return "kw:undefined";
    case "TSBigIntKeyword": return "kw:bigint";
    case "TSObjectKeyword": return "kw:object";
    case "TSSymbolKeyword": return "kw:symbol";
    case "TSThisType": return "kw:this";
  }

  if (type === "TSLiteralType") {
    const literal = node.literal;
    if (literal?.type === "Literal") {
      if (typeof literal.value === "string") return `lit:s:${JSON.stringify(literal.value)}`;
      if (typeof literal.value === "number") return `lit:n:${literal.value}`;
      if (typeof literal.value === "boolean") return `lit:b:${literal.value}`;
    }
    return "lit:?";
  }

  if (type === "TSTypeReference") {
    const name =
      node.typeName?.name ??
      (node.typeName?.type === "TSQualifiedName"
        ? `${node.typeName.left?.name ?? "?"}.${node.typeName.right?.name ?? "?"}`
        : "?");
    const args = (node.typeArguments?.params ?? []).map(fingerprintTypeNode).join(",");
    return args ? `ref:${name}<${args}>` : `ref:${name}`;
  }

  if (type === "TSUnionType" || type === "TSIntersectionType") {
    const operator = type === "TSUnionType" ? "|" : "&";
    const members = (node.types ?? []).map(fingerprintTypeNode).sort();
    return `${operator === "|" ? "union" : "intersect"}[${members.join(operator)}]`;
  }

  if (type === "TSArrayType") return `arr<${fingerprintTypeNode(node.elementType)}>`;
  if (type === "TSTupleType") return `tuple[${(node.elementTypes ?? []).map(fingerprintTypeNode).join(",")}]`;
  if (type === "TSTypeLiteral") {
    const members = (node.members ?? []).map(fingerprintTypeMember).sort();
    return `obj[${members.join("|")}]`;
  }
  if (type === "TSFunctionType" || type === "TSConstructorType") {
    const params = (node.params ?? []).length;
    const ret = node.returnType?.typeAnnotation ? fingerprintTypeNode(node.returnType.typeAnnotation) : "?";
    return `${type === "TSFunctionType" ? "fn" : "ctor"}(${params})=>${ret}`;
  }
  if (type === "TSConditionalType") {
    return `cond(${fingerprintTypeNode(node.checkType)},${fingerprintTypeNode(node.extendsType)},${fingerprintTypeNode(node.trueType)},${fingerprintTypeNode(node.falseType)})`;
  }
  if (type === "TSMappedType") return `mapped(${fingerprintTypeNode(node.typeAnnotation)})`;
  if (type === "TSIndexedAccessType") return `idx(${fingerprintTypeNode(node.objectType)},${fingerprintTypeNode(node.indexType)})`;
  if (type === "TSParenthesizedType") return fingerprintTypeNode(node.typeAnnotation);

  const parts: string[] = [type];
  for (const key of Object.keys(node)) {
    if (NORMALIZE_SKIP_KEYS.has(key) || key === "type") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      parts.push("[" + value.map(fingerprintTypeNode).filter(Boolean).join(",") + "]");
    } else if (value && typeof value === "object" && "type" in value) {
      parts.push(fingerprintTypeNode(value));
    }
  }
  return parts.join("");
}

function fingerprintTypeMember(member: Node): string {
  const name =
    member.key?.type === "Identifier" ? member.key.name :
    member.key?.type === "Literal" ? String(member.key.value) :
    member.type === "TSIndexSignature" ? "[index]" :
    "?";
  const optional = member.optional ? "?" : "";
  const readonly = member.readonly ? "readonly " : "";
  if (member.type === "TSPropertySignature" || member.type === "TSIndexSignature") {
    const valueType = member.typeAnnotation?.typeAnnotation;
    return `${readonly}${name}${optional}:${valueType ? fingerprintTypeNode(valueType) : "?"}`;
  }
  if (
    member.type === "TSMethodSignature" ||
    member.type === "TSCallSignatureDeclaration" ||
    member.type === "TSConstructSignatureDeclaration"
  ) {
    const params = (member.params ?? []).length;
    const ret = member.returnType?.typeAnnotation ? fingerprintTypeNode(member.returnType.typeAnnotation) : "?";
    return `${name}${optional}(${params})=>${ret}`;
  }
  return `${name}:?`;
}

function fingerprintInterface(iface: Node): string | null {
  const members = iface.body?.body ?? [];
  if (members.length === 0) return null;
  const memberFingerprints = members.map(fingerprintTypeMember);
  memberFingerprints.sort();
  return `iface:[${memberFingerprints.join("|")}]`;
}

function fingerprintTypeAlias(typeAlias: Node): string | null {
  const rhs = typeAlias.typeAnnotation;
  if (!rhs) return null;
  if (isBarePrimitiveType(rhs)) return null;
  return `type:${fingerprintTypeNode(rhs)}`;
}

function fingerprintEnum(enm: Node): string | null {
  const members = enm.members ?? [];
  if (members.length === 0) return null;
  const names: string[] = [];
  for (const member of members) {
    const name =
      member.id?.type === "Identifier" ? member.id.name :
      member.id?.type === "Literal" ? String(member.id.value) :
      "?";
    const value = member.initializer ? (constValueRaw(member.initializer) ?? "expr") : "auto";
    names.push(`${name}=${value}`);
  }
  names.sort();
  return `enum:[${names.join("|")}]`;
}

function extractSymbols(ctx: Ctx): SymbolDecl[] {
  const out: SymbolDecl[] = [];
  for (const stmt of ctx.ast.body ?? []) {
    if (stmt.type === "ExportNamedDeclaration" && stmt.source) continue;
    if (stmt.type === "ExportAllDeclaration") continue;

    let decl: Node | null = stmt;
    if (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") {
      decl = stmt.declaration ?? null;
    }
    if (!decl) continue;
    handleDeclaration(decl, ctx, out);
  }
  return out;
}

function handleDeclaration(decl: Node, ctx: Ctx, out: SymbolDecl[]): void {
  const line = ctx.lineOf(decl.start);

  if (decl.type === "VariableDeclaration") {
    for (const declaration of decl.declarations ?? []) {
      if (declaration.id?.type !== "Identifier") continue;
      const init = declaration.init;
      if (!init) continue;
      const declLine = ctx.lineOf(declaration.start);
      if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
        const fingerprint = fingerprintFunction(init);
        if (fingerprint) out.push({ kind: "function", name: declaration.id.name, fingerprint, file: ctx.file, line: declLine, start: declaration.start, end: declaration.end });
      } else {
        const fingerprint = fingerprintConstValue(init, declaration.id.name);
        if (fingerprint) out.push({ kind: "const", name: declaration.id.name, fingerprint, file: ctx.file, line: declLine, start: declaration.start, end: declaration.end });
      }
    }
    return;
  }
  if (decl.type === "FunctionDeclaration" && decl.id?.name) {
    const fingerprint = fingerprintFunction(decl);
    if (fingerprint) out.push({ kind: "function", name: decl.id.name, fingerprint, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "ClassDeclaration" && decl.id?.name) {
    const fingerprint = fingerprintClass(decl);
    if (fingerprint) out.push({ kind: "class", name: decl.id.name, fingerprint, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "TSInterfaceDeclaration" && decl.id?.name) {
    const fingerprint = fingerprintInterface(decl);
    if (fingerprint) out.push({ kind: "interface", name: decl.id.name, fingerprint, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "TSTypeAliasDeclaration" && decl.id?.name) {
    const fingerprint = fingerprintTypeAlias(decl);
    if (fingerprint) out.push({ kind: "type", name: decl.id.name, fingerprint, file: ctx.file, line, start: decl.start, end: decl.end });
    return;
  }
  if (decl.type === "TSEnumDeclaration" && decl.id?.name) {
    const fingerprint = fingerprintEnum(decl);
    if (fingerprint) out.push({ kind: "enum", name: decl.id.name, fingerprint, file: ctx.file, line, start: decl.start, end: decl.end });
  }
}

/** Finds repeated top-level declarations that suggest an agent rebuilt existing code. */
export function detectDuplicateSymbol(ctxs: Ctx[]): Finding[] {
  const declarations: SymbolDecl[] = [];
  const sourceByFile = new Map<string, string>();
  for (const ctx of ctxs) {
    if (TEST_FILE_PATTERN.test(ctx.file)) continue;
    if (GENERATED_PATH_PATTERN.test(ctx.file)) continue;
    sourceByFile.set(ctx.file, ctx.source);
    declarations.push(...extractSymbols(ctx));
  }

  const byKey = new Map<string, SymbolDecl[]>();
  for (const declaration of declarations) {
    const key = `${declaration.kind}:${declaration.fingerprint}`;
    const list = byKey.get(key);
    if (list) list.push(declaration);
    else byKey.set(key, [declaration]);
  }

  const findings: Finding[] = [];
  for (const group of byKey.values()) {
    const minOccurrences = DUP_MIN_OCCURRENCES_BY_KIND[group[0].kind] ?? DUP_MIN_OCCURRENCES_DEFAULT;
    if (group.length < minOccurrences) continue;

    const distinct = new Set(group.map((declaration) => declaration.file));
    const kind = group[0].kind;
    const fingerprintHash = shortHash(group[0].fingerprint);
    const sorted = [...group].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
    const canonical = sorted[0];
    const canonicalSource = sourceByFile.get(canonical.file) ?? "";
    const preview = previewSource(canonicalSource, canonical.start, canonical.end);
    const occurrences = sorted.map((declaration) => ({ name: declaration.name, file: declaration.file, line: declaration.line }));
    const names = [...new Set(occurrences.map((occurrence) => occurrence.name))].sort();

    const sampleNames = names.slice(0, 3).join(", ");
    const moreNames = names.length > 3 ? `, +${names.length - 3} more` : "";
    const where = distinct.size === 1 ? `${group.length}× in 1 file` : `${group.length}× across ${distinct.size} files`;
    const message =
      `${kind} re-declared ${where} ` +
      `(e.g. ${sampleNames}${moreNames}) — agent likely re-built an existing one ` +
      `[group ${fingerprintHash}]`;

    findings.push({
      flag: "duplicateSymbol",
      severity: "candidate",
      file: canonical.file,
      line: canonical.line,
      message,
      metadata: {
        symbolKind: kind,
        fingerprintHash,
        distinctFiles: distinct.size,
        totalDeclarations: group.length,
        preview,
        previewFrom: `${canonical.file}:${canonical.line}`,
        occurrences,
      },
    });
  }
  return findings;
}
