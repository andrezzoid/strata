import type { Node } from "../ast.ts";

export type ModuleSurface = {
  /** Top-level exports only; this is the width seen before opening exported classes. */
  topLevelExports: number;
  /** Exported declarations plus public class members that callers must understand. */
  surfaceElements: number;
};

/** Counts the exported surface concepts used by module-shape detectors. */
export function countModuleSurface(ast: Node): ModuleSurface {
  let topLevelExports = 0;
  let surfaceElements = 0;

  for (const stmt of ast.body) {
    if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const d = stmt.declaration;
        if (d.type === "ClassDeclaration") {
          topLevelExports += 1;
          surfaceElements += 1;
          for (const member of d.body?.body ?? []) {
            if (member.type !== "MethodDefinition" && member.type !== "PropertyDefinition")
              continue;
            const isPrivate =
              member.accessibility === "private" ||
              (typeof member.key?.name === "string" && member.key.name.startsWith("_"));
            if (!isPrivate) surfaceElements += 1;
          }
        } else if (d.type === "VariableDeclaration") {
          const count = d.declarations?.length ?? 0;
          topLevelExports += count;
          surfaceElements += count;
        } else {
          topLevelExports += 1;
          surfaceElements += 1;
        }
      }
      if (stmt.specifiers) {
        topLevelExports += stmt.specifiers.length;
        surfaceElements += stmt.specifiers.length;
      }
    } else if (stmt.type === "ExportDefaultDeclaration") {
      topLevelExports += 1;
      surfaceElements += 1;
    } else if (stmt.type === "ExportAllDeclaration") {
      topLevelExports += 1;
      surfaceElements += 1;
    }
  }

  return { topLevelExports, surfaceElements };
}
