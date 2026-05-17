import type { Node } from "../ast.ts";

/** Direct declaration attached to an export statement, if the statement has one. */
export function exportDeclaration(node: Node): Node | null {
  if (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration") {
    return null;
  }
  return node.declaration ?? null;
}

/**
 * Local declaration names exported elsewhere in the same file.
 *
 * Barrel and type-only exports are skipped because they do not expose a local
 * runtime declaration for single-file detectors to inspect.
 */
export function localExportedNames(ast: Node): Set<string> {
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
