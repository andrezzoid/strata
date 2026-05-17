import type { Ctx, Node } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";
import { exportDeclaration, localExportedNames } from "./export-surface.ts";
import { callableIdentity, forwardedCallShape } from "./pass-through-shape.ts";

type ExportedCallable = {
  node: Node;
  fn: Node;
  name: string;
};

/**
 * Flags exported free functions that publish a new callable name without adding behavior.
 *
 * Barrel re-exports are intentionally outside this detector: they curate module
 * APIs but do not introduce a callable wrapper body that can pretend to hide
 * complexity.
 */
export function detectPassThroughExport({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const exportedNames = localExportedNames(ast);

  for (const statement of ast.body ?? []) {
    for (const candidate of exportedCallables(statement, exportedNames)) {
      const forwarded = forwardedCallShape(candidate.fn, candidate.name);
      if (!forwarded) continue;

      const callee = forwarded.call.callee;
      if (callee?.type === "Identifier" && callee.name === candidate.name) continue;

      findings.push(
        createFinding({
          flag: "passThroughExport",
          file,
          line: lineOf(candidate.node.start),
          message:
            "exported function delegates to another callable with same args - public surface without logic",
          metadata: {
            functionName: candidate.name,
            callee: callableIdentity(callee),
            paramCount: forwarded.paramNames.length,
          },
          identity: [candidate.name, callableIdentity(callee), forwarded.paramNames],
        }),
      );
    }
  }

  return findings;
}

function exportedCallables(statement: Node, exportedNames: Set<string>): ExportedCallable[] {
  const declaration = exportDeclaration(statement);
  if (declaration) return callablesFromDeclaration(declaration, null);

  if (statement.type === "FunctionDeclaration" && exportedNames.has(statement.id?.name)) {
    return callablesFromDeclaration(statement, exportedNames);
  }
  if (statement.type === "VariableDeclaration") {
    return callablesFromDeclaration(statement, exportedNames);
  }

  return [];
}

function callablesFromDeclaration(
  declaration: Node,
  exportedNames: Set<string> | null,
): ExportedCallable[] {
  if (declaration.type === "FunctionDeclaration") {
    const name = declaration.id?.name;
    if (typeof name !== "string") return [];
    if (exportedNames && !exportedNames.has(name)) return [];
    return [{ node: declaration, fn: declaration, name }];
  }

  if (declaration.type !== "VariableDeclaration") return [];

  const callables: ExportedCallable[] = [];
  for (const declarator of declaration.declarations ?? []) {
    const name = declarator.id?.name;
    if (typeof name !== "string") continue;
    if (exportedNames && !exportedNames.has(name)) continue;
    if (!isFunctionLikeExpression(declarator.init)) continue;
    callables.push({ node: declarator, fn: declarator.init, name });
  }
  return callables;
}

function isFunctionLikeExpression(node: Node): boolean {
  return node?.type === "FunctionExpression" || node?.type === "ArrowFunctionExpression";
}
