import type { Ctx, Node } from "../ast.ts";
import { walk } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";

const WIDE_SIGNATURE_MAX = 4;

/** Flags functions and methods that require too many positional parameters. */
export function detectWideSignature({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    let fn: Node | null = null;
    let nameForMsg = "";
    if (node.type === "FunctionDeclaration") {
      fn = node;
      nameForMsg = node.id?.name ?? "<anonymous>";
    } else if (node.type === "MethodDefinition") {
      fn = node.value;
      const key = node.key?.name ?? node.key?.value ?? "<anonymous>";
      nameForMsg = node.kind === "constructor" ? "constructor" : `method ${key}`;
    } else {
      return;
    }
    if (!fn?.params) return;

    let required = 0;
    for (const param of fn.params) {
      if (param.type === "Identifier" && !param.optional) required += 1;
      else if (param.type === "TSParameterProperty") {
        const inner = param.parameter;
        if (inner?.type === "Identifier" && !inner.optional) required += 1;
      }
    }

    if (required <= WIDE_SIGNATURE_MAX) return;
    findings.push(
      createFinding({
        flag: "wideSignature",
        file,
        line: lineOf(node.start),
        message: `${nameForMsg} takes ${required} required parameters — wide surface, consider an options object or splitting`,
        metadata: { name: nameForMsg, requiredParams: required },
        identity: [nameForMsg, required],
      }),
    );
  });
  return findings;
}
