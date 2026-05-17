import type { Ctx, Node } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";

const WIDE_SIGNATURE_MAX = 4;

/** Flags exported functions and exported-class members that require too many positional parameters. */
export function detectWideSignature({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const exportedNames = localExportedNames(ast);

  for (const statement of ast.body ?? []) {
    const declaration = exportDeclaration(statement);
    if (declaration) visitExportedDeclaration(declaration);

    if (statement.type === "FunctionDeclaration" && exportedNames.has(statement.id?.name)) {
      addFunctionFinding(statement, statement.id?.name ?? "<anonymous>");
    } else if (statement.type === "ClassDeclaration" && exportedNames.has(statement.id?.name)) {
      addClassFindings(statement);
    } else if (statement.type === "VariableDeclaration") {
      addExportedClassExpressionFindings(statement);
    }
  }

  return findings;

  function visitExportedDeclaration(declaration: Node): void {
    if (declaration.type === "FunctionDeclaration") {
      addFunctionFinding(declaration, declaration.id?.name ?? "<anonymous>");
    } else if (declaration.type === "ClassDeclaration" || declaration.type === "ClassExpression") {
      addClassFindings(declaration);
    } else if (declaration.type === "VariableDeclaration") {
      addExportedClassExpressionFindings(declaration, true);
    }
  }

  function addExportedClassExpressionFindings(declaration: Node, directlyExported = false): void {
    for (const declarator of declaration.declarations ?? []) {
      if (!directlyExported && !exportedNames.has(declarator.id?.name)) continue;
      if (declarator.init?.type === "ClassExpression") addClassFindings(declarator.init);
    }
  }

  function addClassFindings(classNode: Node): void {
    for (const member of classNode.body?.body ?? []) {
      const nameForMsg = publicMemberName(member);
      if (!nameForMsg) continue;
      addFunctionFinding(member.value, nameForMsg, member);
    }
  }

  function addFunctionFinding(fn: Node, nameForMsg: string, locationNode = fn): void {
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
    findings.push(
      createFinding({
        flag: "wideSignature",
        file,
        line: lineOf(locationNode.start),
        message: `${nameForMsg} takes ${required} required parameters — wide surface, consider an options object or splitting`,
        metadata: { name: nameForMsg, requiredParams: required },
        identity: [nameForMsg, required],
      }),
    );
  }
}

function exportDeclaration(node: Node): Node | null {
  if (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration")
    return null;
  return node.declaration ?? null;
}

function localExportedNames(ast: Node): Set<string> {
  const names = new Set<string>();
  for (const statement of ast.body ?? []) {
    if (statement.type === "ExportNamedDeclaration") {
      if (statement.source || statement.exportKind === "type") continue;
      for (const specifier of statement.specifiers ?? []) {
        if (specifier.exportKind === "type") continue;
        if (typeof specifier.local?.name === "string") names.add(specifier.local.name);
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      if (statement.declaration?.type === "Identifier") names.add(statement.declaration.name);
    }
  }
  return names;
}

function publicMemberName(node: Node): string | null {
  if (node.type !== "MethodDefinition") return null;
  if (node.accessibility === "private" || node.accessibility === "protected") return null;
  if (node.key?.type === "PrivateIdentifier") return null;
  if (node.kind === "constructor") return "constructor";

  const key = node.key?.name ?? node.key?.value;
  return typeof key === "string" ? `method ${key}` : null;
}
