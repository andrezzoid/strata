import type { Ctx } from "../ast.ts";
import { walk } from "../ast.ts";
import type { Finding } from "../types.ts";

/** Flags catch clauses that silently discard the error path. */
export function detectEmptyCatch({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || (node.body.body?.length ?? 0) > 0) return;
    findings.push({
      flag: "emptyCatch",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "catch body has no executable statement",
      metadata: {},
    });
  });
  return findings;
}

/** Flags catch clauses whose only behavior is throwing the same error again. */
export function detectCatchRethrow({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || node.body.body?.length !== 1) return;
    const stmt = node.body.body[0];
    if (stmt.type !== "ThrowStatement" || stmt.argument?.type !== "Identifier") return;
    if (node.param?.type === "Identifier" && node.param.name !== stmt.argument.name) return;
    findings.push({
      flag: "catchRethrow",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "catch body is a pure rethrow",
      metadata: {},
    });
  });
  return findings;
}
