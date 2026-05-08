import type { Ctx } from "../ast.ts";
import { walk } from "../ast.ts";
import type { Finding } from "../types.ts";

/** Flags TypeScript suppression comments and casts that bypass static checks. */
export function detectTsEscapeHatches({ file, ast, comments, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "TSAsExpression") return;
    if (node.typeAnnotation?.type !== "TSAnyKeyword") return;
    findings.push({
      flag: "tsEscapeHatch",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "TS escape hatch (`as any`)",
      metadata: { kind: "asAny" },
    });
  });
  for (const comment of comments) {
    const value = comment.value.trim();
    if (!/^@ts-(ignore|expect-error)\b/.test(value)) continue;
    findings.push({
      flag: "tsEscapeHatch",
      severity: "candidate",
      file,
      line: lineOf(comment.start),
      message: "TS escape hatch (`@ts-ignore` / `@ts-expect-error`)",
      metadata: { kind: value.split(/\s/)[0] },
    });
  }
  return findings;
}
