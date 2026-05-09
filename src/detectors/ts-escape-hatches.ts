import type { Ctx } from "../ast.ts";
import { walk } from "../ast.ts";
import { createFinding, createIdentityTracker } from "../finding.ts";
import type { Finding } from "../types.ts";

/** Flags TypeScript suppression comments and casts that bypass static checks. */
export function detectTsEscapeHatches({ file, source, ast, comments, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const identityFor = createIdentityTracker();
  walk(ast, (node) => {
    if (node.type !== "TSAsExpression") return;
    if (node.typeAnnotation?.type !== "TSAnyKeyword") return;
    findings.push(
      createFinding({
        flag: "tsEscapeHatch",
        file,
        line: lineOf(node.start),
        message: "TS escape hatch (`as any`)",
        metadata: { kind: "asAny" },
        identity: identityFor(["asAny", source.slice(node.start, node.end)]),
      }),
    );
  });
  for (const comment of comments) {
    const value = comment.value.trim();
    if (!/^@ts-(ignore|expect-error)\b/.test(value)) continue;
    findings.push(
      createFinding({
        flag: "tsEscapeHatch",
        file,
        line: lineOf(comment.start),
        message: "TS escape hatch (`@ts-ignore` / `@ts-expect-error`)",
        metadata: { kind: value.split(/\s/)[0] },
        identity: identityFor(["ts-comment", value]),
      }),
    );
  }
  return findings;
}
