import type { Ctx } from "../ast.ts";
import { GENERATED_PATH_PATTERN, TEST_FILE_PATTERN } from "../skip-patterns.ts";
import { resolveRelativeImport } from "../scope.ts";
import type { Finding } from "../types.ts";

const ORPHAN_ENTRYPOINT_PATTERNS = [
  /^(src\/)?(index|main|app|server|cli|bin)\.tsx?$/,
  /^(src\/)?(pages|routes|api|app|bin)\//,
  /\.d\.ts$/,
  /\.config\.tsx?$/,
];

/** Flags files that nothing imports, excluding common framework and CLI entrypoints. */
export function detectOrphanFile(ctxs: Ctx[]): Finding[] {
  const eligibleFiles = ctxs.filter(
    (ctx) =>
      !TEST_FILE_PATTERN.test(ctx.file) &&
      !GENERATED_PATH_PATTERN.test(ctx.file) &&
      !ORPHAN_ENTRYPOINT_PATTERNS.some((pattern) => pattern.test(ctx.file)),
  );
  if (eligibleFiles.length === 0) return [];

  const fileSet = new Set(ctxs.map((ctx) => ctx.file));
  const incoming = new Map<string, number>();

  for (const ctx of ctxs) {
    for (const stmt of ctx.ast.body ?? []) {
      const source = stmt.source?.value;
      if (typeof source !== "string") continue;
      if (!source.startsWith(".")) continue;

      const resolved = resolveRelativeImport(ctx.file, source, fileSet);
      if (!resolved) continue;
      incoming.set(resolved, (incoming.get(resolved) ?? 0) + 1);
    }
  }

  const findings: Finding[] = [];
  for (const ctx of eligibleFiles) {
    if ((incoming.get(ctx.file) ?? 0) > 0) continue;
    findings.push({
      flag: "orphanFile",
      severity: "candidate",
      file: ctx.file,
      line: 1,
      message:
        "file is not imported by any other file — possible dead code or forgotten exploration",
      metadata: {},
    });
  }
  return findings;
}
