import type { Ctx } from "./ast.ts";

type ScopeEntry =
  | { kind: "local" }
  | { kind: "imported"; sourceFile: string; sourceName: string }
  | { kind: "external" }
  | { kind: "unresolvable" };

/** Builds the local name table needed to resolve implements/extends to concrete declaration sites. */
export function buildFileScope(ctx: Ctx, fileSet: Set<string>): Map<string, ScopeEntry> {
  const refs = new Map<string, ScopeEntry>();

  for (const stmt of ctx.ast.body ?? []) {
    const decl =
      stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration"
        ? stmt.declaration
        : stmt;
    if (decl?.id?.name) {
      const t = decl.type;
      if (
        t === "TSInterfaceDeclaration" ||
        t === "ClassDeclaration" ||
        t === "TSTypeAliasDeclaration" ||
        t === "TSEnumDeclaration" ||
        t === "FunctionDeclaration"
      ) {
        refs.set(decl.id.name, { kind: "local" });
      }
    }
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations ?? []) {
        if (d.id?.type === "Identifier") refs.set(d.id.name, { kind: "local" });
      }
    }

    if (stmt.type === "ImportDeclaration" && typeof stmt.source?.value === "string") {
      const source = stmt.source.value;
      const sourceFile = source.startsWith(".")
        ? resolveRelativeImport(ctx.file, source, fileSet)
        : null;
      const isExternal = !source.startsWith(".");

      for (const spec of stmt.specifiers ?? []) {
        const localName = spec.local?.name;
        if (!localName) continue;
        if (spec.type === "ImportSpecifier" && spec.imported?.name) {
          if (sourceFile)
            refs.set(localName, { kind: "imported", sourceFile, sourceName: spec.imported.name });
          else if (isExternal) refs.set(localName, { kind: "external" });
          else refs.set(localName, { kind: "unresolvable" });
        } else {
          refs.set(localName, { kind: "unresolvable" });
        }
      }
    }

    if (stmt.type === "ExportNamedDeclaration" && typeof stmt.source?.value === "string") {
      const source = stmt.source.value;
      const sourceFile = source.startsWith(".")
        ? resolveRelativeImport(ctx.file, source, fileSet)
        : null;
      for (const spec of stmt.specifiers ?? []) {
        const exposedName = spec.exported?.name ?? spec.local?.name;
        const sourceName = spec.local?.name;
        if (!exposedName || !sourceName) continue;
        if (sourceFile) refs.set(exposedName, { kind: "imported", sourceFile, sourceName });
        else refs.set(exposedName, { kind: "external" });
      }
    }
  }

  return refs;
}

/** Follows import/re-export chains to the declaration site visible inside the scanned project. */
export function resolveDeclarationSite(
  startFile: string,
  startName: string,
  scopes: Map<string, Map<string, ScopeEntry>>,
): { file: string; name: string } | null {
  let file = startFile;
  let name = startName;
  for (let depth = 0; depth < 16; depth++) {
    const scope = scopes.get(file);
    if (!scope) return null;
    const entry = scope.get(name);
    if (!entry) return null;
    if (entry.kind === "local") return { file, name };
    if (entry.kind !== "imported") return null;
    file = entry.sourceFile;
    name = entry.sourceName;
  }
  return null;
}

/** Resolves ./foo imports against the project-relative file set. */
export function resolveRelativeImport(
  fromFile: string,
  importPath: string,
  fileSet: Set<string>,
): string | null {
  const fromDir = fromFile.split("/").slice(0, -1).join("/");
  const joined = normalizePath(fromDir ? `${fromDir}/${importPath}` : importPath);
  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
  ];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
