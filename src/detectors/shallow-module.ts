import type { Ctx } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";
import { countModuleSurface } from "./module-surface.ts";

// Thresholds chosen during source-tool calibration for high recall without turning every small file into noise.
const SHALLOW_RATIO = 0.3;
const SHALLOW_MIN_BODY = 3;
const SHALLOW_MIN_SURFACE = 2;

// Counts API surface against non-blank/non-comment/non-import body lines. Public
// class members count because they are part of the caller-facing surface.
export function detectShallowModule({ file, source, ast }: Ctx): Finding[] {
  const { surfaceElements: surface } = countModuleSurface(ast);

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
    createFinding({
      flag: "shallowModule",
      file,
      line: 1,
      message: `${surface} surface elements / ${body} body lines — interface heavy relative to implementation`,
      metadata: { surface, bodyLines: body },
      identity: ["module-surface"],
    }),
  ];
}
