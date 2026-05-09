import type { Ctx } from "../ast.ts";
import { walk } from "../ast.ts";
import { createFinding, createIdentityTracker } from "../finding.ts";
import type { Finding } from "../types.ts";

/** Flags catch clauses that silently discard the error path. */
export function detectEmptyCatch({ file, source, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const identityFor = createIdentityTracker();
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || (node.body.body?.length ?? 0) > 0) return;
    findings.push(
      createFinding({
        flag: "emptyCatch",
        file,
        line: lineOf(node.start),
        message: "catch body has no executable statement",
        metadata: {},
        identity: identityFor(["empty", source.slice(node.start, node.end)]),
      }),
    );
  });
  return findings;
}

/** Flags catch clauses whose only behavior is throwing the same error again. */
export function detectCatchRethrow({ file, source, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const identityFor = createIdentityTracker();
  walk(ast, (node) => {
    if (node.type !== "CatchClause") return;
    if (!node.body || node.body.body?.length !== 1) return;
    const stmt = node.body.body[0];
    if (stmt.type !== "ThrowStatement" || stmt.argument?.type !== "Identifier") return;
    if (node.param?.type === "Identifier" && node.param.name !== stmt.argument.name) return;
    findings.push(
      createFinding({
        flag: "catchRethrow",
        file,
        line: lineOf(node.start),
        message: "catch body is a pure rethrow",
        metadata: {},
        identity: identityFor(["rethrow", source.slice(node.start, node.end)]),
      }),
    );
  });
  return findings;
}
