import type { Ctx, Node } from "../ast.ts";
import { walk } from "../ast.ts";
import type { Finding } from "../types.ts";

// PoSD Ch. 7: a class method delegating to instance state with no logic. Free
// functions are excluded because they can be useful naming/type abstractions.
export function detectPassThroughMethod({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "MethodDefinition") return;
    if (node.kind === "constructor") return;

    const fn = node.value;
    if (!fn?.body?.body || fn.body.body.length !== 1) return;

    const paramNames: string[] = [];
    for (const param of fn.params ?? []) {
      if (param.type === "Identifier") paramNames.push(param.name);
      else if (param.type === "TSParameterProperty" && param.parameter?.type === "Identifier") {
        paramNames.push(param.parameter.name);
      } else {
        return;
      }
    }

    const stmt = fn.body.body[0];
    let call: Node | null = null;
    if (stmt.type === "ReturnStatement" && stmt.argument?.type === "CallExpression") {
      call = stmt.argument;
    } else if (stmt.type === "ExpressionStatement" && stmt.expression?.type === "CallExpression") {
      call = stmt.expression;
    }
    if (!call || call.callee?.type !== "MemberExpression") return;

    const obj = call.callee.object;
    const isThisRooted =
      obj?.type === "ThisExpression" ||
      (obj?.type === "MemberExpression" && obj.object?.type === "ThisExpression");
    if (!isThisRooted) return;

    if ((call.arguments?.length ?? 0) !== paramNames.length) return;
    for (let i = 0; i < paramNames.length; i++) {
      const arg = call.arguments[i];
      if (arg.type !== "Identifier" || arg.name !== paramNames[i]) return;
    }

    findings.push({
      flag: "passThroughMethod",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: "class method delegates to instance state with same args — layer without logic",
      metadata: {},
    });
  });
  return findings;
}
