import { join } from "node:path";

import type { Ctx } from "./ast.ts";

export type ImportResolver = {
  /** Returns a scanned project file for local imports; package or unresolved sources return null. */
  resolve(fromFile: string, importPath: string): string | null;
};

type TsconfigResolverConfig = {
  /** Project-relative base directory for non-relative imports, or null when baseUrl is absent. */
  baseUrl: string | null;
  /** Ordered path mappings from most-specific to least-specific. */
  pathRules: PathRule[];
};

type PathRule = {
  /** Text before the single supported wildcard, or the full pattern for exact rules. */
  prefix: string;
  /** Text after the wildcard; empty for exact rules and suffixless wildcards. */
  suffix: string;
  /** Project-relative target patterns, still possibly containing the wildcard placeholder. */
  targets: string[];
  /** True when the pattern contains a `*` segment that captures source text. */
  hasWildcard: boolean;
};

type ScopeEntry =
  | { kind: "local" }
  | { kind: "imported"; sourceFile: string; sourceName: string }
  | { kind: "external" }
  | { kind: "unresolvable" };

const EMPTY_TSCONFIG_RESOLUTION: TsconfigResolverConfig = { baseUrl: null, pathRules: [] };

/** Creates a resolver with today's relative-only behavior for tests and no-config projects. */
export function createRelativeImportResolver(files: Iterable<string>): ImportResolver {
  const fileSet = files instanceof Set ? files : new Set(files);
  return {
    resolve(fromFile, importPath) {
      return importPath.startsWith(".")
        ? resolveRelativeImport(fromFile, importPath, fileSet)
        : null;
    },
  };
}

/** Creates the import resolver used by project-graph analysis for one scan root. */
export async function createImportResolver(
  root: string,
  files: Iterable<string>,
): Promise<ImportResolver> {
  const fileSet = files instanceof Set ? files : new Set(files);
  const config = await readRootTsconfigResolverConfig(root);

  return {
    resolve(fromFile, importPath) {
      if (importPath.startsWith(".")) return resolveRelativeImport(fromFile, importPath, fileSet);

      for (const candidateBase of pathAliasCandidates(importPath, config)) {
        const resolved = resolveImportCandidate(candidateBase, fileSet);
        if (resolved) return resolved;
      }

      if (config.baseUrl !== null) {
        return resolveImportCandidate(joinProjectPath(config.baseUrl, importPath), fileSet);
      }

      return null;
    },
  };
}

/** Builds the local name table needed to resolve implements/extends to concrete declaration sites. */
export function buildFileScope(ctx: Ctx, imports: ImportResolver): Map<string, ScopeEntry> {
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
      const sourceFile = imports.resolve(ctx.file, source);
      const isExternal = !sourceFile && !source.startsWith(".");

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
      const sourceFile = imports.resolve(ctx.file, source);
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
  return resolveImportCandidate(joined, fileSet);
}

function resolveImportCandidate(importBase: string, fileSet: Set<string>): string | null {
  const joined = normalizePath(importBase);
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

async function readRootTsconfigResolverConfig(root: string): Promise<TsconfigResolverConfig> {
  const tsconfig = Bun.file(join(root, "tsconfig.json"));
  if (!(await tsconfig.exists())) return EMPTY_TSCONFIG_RESOLUTION;

  try {
    return parseTsconfigResolverConfig(await tsconfig.text());
  } catch {
    // Alias resolution is optional scanner context; unreadable or unsupported
    // config should degrade to relative-only analysis, not abort every detector.
    return EMPTY_TSCONFIG_RESOLUTION;
  }
}

function parseTsconfigResolverConfig(source: string): TsconfigResolverConfig {
  const config = JSON.parse(removeTrailingCommas(stripJsonComments(source))) as unknown;
  const compilerOptions = asRecord(asRecord(config).compilerOptions);
  const baseUrlValue = compilerOptions.baseUrl;
  const baseUrl = typeof baseUrlValue === "string" ? normalizePath(baseUrlValue) : null;
  const pathRules = Object.entries(asRecord(compilerOptions.paths))
    .flatMap(([pattern, value]) => buildPathRule(pattern, value))
    .sort(comparePathRules);

  return { baseUrl, pathRules };
}

function buildPathRule(pattern: string, value: unknown): PathRule[] {
  if (!Array.isArray(value)) return [];
  const targets = value.filter((target): target is string => typeof target === "string");
  if (targets.length === 0) return [];

  const wildcardAt = pattern.indexOf("*");
  if (wildcardAt === -1) {
    return [{ prefix: pattern, suffix: "", targets, hasWildcard: false }];
  }

  return [
    {
      prefix: pattern.slice(0, wildcardAt),
      suffix: pattern.slice(wildcardAt + 1),
      targets,
      hasWildcard: true,
    },
  ];
}

function comparePathRules(a: PathRule, b: PathRule): number {
  if (a.hasWildcard !== b.hasWildcard) return a.hasWildcard ? 1 : -1;
  return b.prefix.length - a.prefix.length || b.suffix.length - a.suffix.length;
}

function pathAliasCandidates(importPath: string, config: TsconfigResolverConfig): string[] {
  const candidates: string[] = [];
  for (const rule of config.pathRules) {
    const capture = matchPathRule(importPath, rule);
    if (capture === null) continue;
    for (const target of rule.targets) {
      candidates.push(joinProjectPath(config.baseUrl ?? "", target.split("*").join(capture)));
    }
  }
  return candidates;
}

function matchPathRule(importPath: string, rule: PathRule): string | null {
  if (!rule.hasWildcard) return importPath === rule.prefix ? "" : null;
  if (!importPath.startsWith(rule.prefix) || !importPath.endsWith(rule.suffix)) return null;
  return importPath.slice(rule.prefix.length, importPath.length - rule.suffix.length);
}

function joinProjectPath(base: string, path: string): string {
  return normalizePath(base ? `${base}/${path}` : path);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stripJsonComments(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      output += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        output += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      i++;
      continue;
    }

    output += char;
  }
  return output;
}

function removeTrailingCommas(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = i + 1;
      while (/\s/.test(source[nextIndex] ?? "")) nextIndex++;
      if (source[nextIndex] === "}" || source[nextIndex] === "]") continue;
    }

    output += char;
  }
  return output;
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
