import type { Ctx, Node } from "../ast.ts";
import { createFinding } from "../finding.ts";
import { isNonReviewablePath } from "../skip-patterns.ts";
import type { Finding } from "../types.ts";
import { exportDeclaration, localExportedNames } from "./export-surface.ts";

type MutableFamily = "object" | "array" | "Map" | "Set" | "WeakMap" | "WeakSet";

type AccessorEvidence = {
  /** Public member name as declared in the class body. */
  name: string;
  /** Boundary shape that exposes the field. */
  kind: "method" | "getter";
  /** One-based line of the public member declaration. */
  line: number;
};

type MutableField = {
  /** Source-level name, retaining `#` for private identifiers. */
  name: string;
  /** Proven container family shared with any accepted return annotation. */
  family: MutableFamily;
  /** One-based line of the private field declaration. */
  line: number;
  /** Public members returning this exact field, in declaration order. */
  accessors: AccessorEvidence[];
};

const REFERENCE_FAMILIES: Readonly<Record<string, MutableFamily>> = {
  Array: "array",
  Map: "Map",
  Set: "Set",
  WeakMap: "WeakMap",
  WeakSet: "WeakSet",
};

/**
 * Finds exported classes whose public API returns an exact private mutable field.
 *
 * The proof is deliberately declaration-local: aliases, inferred flows, custom
 * collections, readonly views, and project-wide type resolution are excluded.
 */
export function detectExposedMutableRepresentation({ file, ast, lineOf }: Ctx): Finding[] {
  if (isNonReviewablePath(file)) return [];

  const findings: Finding[] = [];
  const exportedNames = localExportedNames(ast);
  const fileBindings = topLevelBindings(ast);

  // Parenthesized default identifiers are this detector's declaration-local
  // extension; the shared export helper keeps its narrower contract.
  for (const statement of ast.body ?? []) {
    if (statement.type !== "ExportDefaultDeclaration") continue;
    const declaration = unwrapParentheses(statement.declaration);
    if (declaration?.type === "Identifier") exportedNames.add(declaration.name);
  }

  for (const statement of ast.body ?? []) {
    const declaration = exportDeclaration(statement);
    if (declaration?.type === "ClassDeclaration") inspectClass(declaration);

    if (statement.type === "ClassDeclaration" && exportedNames.has(statement.id?.name)) {
      inspectClass(statement);
    }
  }

  return findings;

  function inspectClass(classNode: Node): void {
    if ((classNode.decorators?.length ?? 0) > 0) return;

    // Type and value namespaces are intentionally combined: uncertainty about
    // either meaning of a built-in name suppresses the candidate.
    const classBindings = new Set(fileBindings);
    addTypeParameterBindings(classBindings, classNode.typeParameters);

    const members: Node[] = classNode.body?.body ?? [];
    const fields = new Map<string, MutableField>();
    for (const member of members) {
      const field = mutablePrivateField(member, classBindings, lineOf);
      if (field && !fields.has(field.name)) fields.set(field.name, field);
    }
    if (fields.size === 0) return;

    const overloadedKeys = new Set<string>();
    for (const member of members) {
      const key = overloadMemberKey(member);
      if (member.type === "MethodDefinition" && key && !member.value?.body) {
        overloadedKeys.add(key);
      }
    }

    for (const member of members) {
      const accessor = exposingAccessor(member, fields, overloadedKeys, classBindings, lineOf);
      if (accessor) fields.get(accessor.fieldName)?.accessors.push(accessor.evidence);
    }

    const className = classNode.id?.name ?? "<default>";
    for (const field of fields.values()) {
      if (field.accessors.length === 0) continue;
      const firstAccessor = field.accessors[0];
      findings.push(
        createFinding({
          flag: "exposedMutableRepresentation",
          file,
          line: firstAccessor.line,
          message: `${className} exposes private mutable ${field.family} field '${field.name}' through ${field.accessors.length} public member${field.accessors.length === 1 ? "" : "s"}`,
          metadata: {
            className,
            fieldName: field.name,
            fieldLine: field.line,
            mutableFamily: field.family,
            accessors: field.accessors,
          },
          identity: [className, field.name, field.family],
        }),
      );
    }
  }
}

function mutablePrivateField(
  member: Node,
  blockedNames: ReadonlySet<string>,
  lineOf: Ctx["lineOf"],
): MutableField | null {
  if (member.type !== "PropertyDefinition") return null;
  if (member.static || member.optional || member.declare || member.computed) return null;
  if ((member.decorators?.length ?? 0) > 0) return null;
  if (member.accessibility !== "private" && member.key?.type !== "PrivateIdentifier") return null;

  const name = fieldName(member.key);
  if (!name) return null;

  // An annotation is authoritative; an unknown or readonly public view must not
  // be replaced with the initializer's more permissive runtime shape.
  const family = member.typeAnnotation
    ? classifyType(member.typeAnnotation.typeAnnotation, blockedNames)
    : classifyInitializer(member.value, blockedNames);
  if (!family) return null;

  return { name, family, line: lineOf(member.start), accessors: [] };
}

function exposingAccessor(
  member: Node,
  fields: ReadonlyMap<string, MutableField>,
  overloadedKeys: ReadonlySet<string>,
  classBindings: ReadonlySet<string>,
  lineOf: Ctx["lineOf"],
): { fieldName: string; evidence: AccessorEvidence } | null {
  if (member.type !== "MethodDefinition") return null;
  if (member.kind !== "method" && member.kind !== "get") return null;
  if (member.static || member.optional || member.computed) return null;
  if (member.accessibility === "private" || member.accessibility === "protected") return null;
  if (member.key?.type === "PrivateIdentifier" || (member.decorators?.length ?? 0) > 0) return null;

  const name = memberName(member);
  const key = overloadMemberKey(member);
  if (!name || !key || overloadedKeys.has(key)) return null;

  const fn = member.value;
  if (!fn || fn.async || fn.generator || (fn.params?.length ?? 0) !== 0) return null;

  const statements = fn.body?.type === "BlockStatement" ? (fn.body.body ?? []) : [];
  if (statements.length !== 1 || statements[0].type !== "ReturnStatement") return null;

  // Parentheses preserve identity; every other wrapper changes or obscures the
  // expression and is outside this detector's proof.
  const returnedField = exactReturnedField(statements[0].argument);
  if (!returnedField) return null;
  const field = fields.get(returnedField);
  if (!field) return null;

  if (fn.returnType) {
    const returnBindings = new Set(classBindings);
    addTypeParameterBindings(returnBindings, fn.typeParameters);
    if (classifyType(fn.returnType.typeAnnotation, returnBindings) !== field.family) return null;
  }

  return {
    fieldName: returnedField,
    evidence: {
      name,
      kind: member.kind === "get" ? "getter" : "method",
      line: lineOf(member.start),
    },
  };
}

function classifyType(node: Node | null, blockedNames: ReadonlySet<string>): MutableFamily | null {
  while (node?.type === "TSParenthesizedType") node = node.typeAnnotation;
  if (!node) return null;
  if (node.type === "TSArrayType") return "array";
  if (node.type === "TSTypeLiteral") {
    return (node.members ?? []).some(isWritableTypeMember) ? "object" : null;
  }
  if (node.type !== "TSTypeReference" || node.typeName?.type !== "Identifier") return null;

  const name = node.typeName.name;
  return blockedNames.has(name) ? null : (REFERENCE_FAMILIES[name] ?? null);
}

function classifyInitializer(
  node: Node | null,
  blockedNames: ReadonlySet<string>,
): MutableFamily | null {
  node = unwrapParentheses(node);
  if (node?.type === "ObjectExpression") return "object";
  if (node?.type === "ArrayExpression") return "array";
  if (node?.type !== "NewExpression" || node.callee?.type !== "Identifier") return null;

  const name = node.callee.name;
  return blockedNames.has(name) ? null : (REFERENCE_FAMILIES[name] ?? null);
}

function isWritableTypeMember(member: Node): boolean {
  if (member.type === "TSPropertySignature" || member.type === "TSIndexSignature") {
    return !member.readonly;
  }
  return member.type === "TSMethodSignature" && (member.kind === "method" || member.kind === "set");
}

function exactReturnedField(node: Node | null): string | null {
  node = unwrapParentheses(node);
  if (node?.type !== "MemberExpression" || node.computed || node.optional) return null;
  if (unwrapParentheses(node.object)?.type !== "ThisExpression") return null;
  return fieldName(node.property);
}

function unwrapParentheses(node: Node | null): Node | null {
  while (node?.type === "ParenthesizedExpression") node = node.expression;
  return node;
}

function fieldName(key: Node | null): string | null {
  if (key?.type === "PrivateIdentifier") return `#${key.name}`;
  if (key?.type === "Identifier") return key.name;
  if (key?.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

function memberName(member: Node): string | null {
  if (member.computed) return null;
  if (member.key?.type === "Identifier") return member.key.name;
  if (
    member.key?.type === "Literal" &&
    (typeof member.key.value === "string" || typeof member.key.value === "number")
  ) {
    return String(member.key.value);
  }
  return null;
}

function overloadMemberKey(member: Node): string | null {
  const key = member.key;
  // Statically-valued bracket keys still name a fixed property, while `#name`
  // occupies a distinct class-private namespace from ordinary properties.
  if (key?.type === "PrivateIdentifier") return `private:${key.name}`;
  if (key?.type === "Identifier" && !member.computed) return `property:${key.name}`;
  if (key?.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")) {
    return `property:${String(key.value)}`;
  }
  if (key?.type === "TemplateLiteral" && (key.expressions?.length ?? 0) === 0) {
    const value = key.quasis?.[0]?.value?.cooked;
    return typeof value === "string" ? `property:${value}` : null;
  }
  return null;
}

function topLevelBindings(ast: Node): Set<string> {
  const names = new Set<string>();
  for (const statement of ast.body ?? []) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers ?? []) {
        if (typeof specifier.local?.name === "string") names.add(specifier.local.name);
      }
      continue;
    }

    const declaration = exportDeclaration(statement) ?? statement;
    if (declaration.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations ?? []) {
        addPatternBindings(names, declarator.id);
      }
    } else if (typeof declaration.id?.name === "string") {
      names.add(declaration.id.name);
    }

    addModuleVarBindings(names, statement);
  }
  return names;
}

function addModuleVarBindings(names: Set<string>, node: Node | null): void {
  if (!node || typeof node !== "object") return;
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassExpression" ||
    node.type === "TSModuleDeclaration"
  ) {
    return;
  }
  if (node.type === "VariableDeclaration") {
    if (node.kind === "var") {
      for (const declarator of node.declarations ?? []) addPatternBindings(names, declarator.id);
    }
    return;
  }

  // `var` crosses statement blocks but not function, class, or namespace scopes.
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "range") continue;
    if (Array.isArray(value)) {
      for (const child of value) addModuleVarBindings(names, child);
    } else if (value && typeof value === "object") {
      addModuleVarBindings(names, value);
    }
  }
}

function addPatternBindings(names: Set<string>, pattern: Node | null): void {
  if (!pattern) return;
  if (pattern.type === "Identifier") {
    names.add(pattern.name);
  } else if (pattern.type === "AssignmentPattern") {
    addPatternBindings(names, pattern.left);
  } else if (pattern.type === "RestElement") {
    addPatternBindings(names, pattern.argument);
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements ?? []) addPatternBindings(names, element);
  } else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties ?? []) {
      addPatternBindings(
        names,
        property.type === "RestElement" ? property.argument : property.value,
      );
    }
  }
}

function addTypeParameterBindings(names: Set<string>, declaration: Node | null): void {
  for (const parameter of declaration?.params ?? []) {
    const name = parameter.name?.name ?? parameter.name;
    if (typeof name === "string") names.add(name);
  }
}
