import type { Ctx, Node } from "../ast.ts";
import { walk } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";

// Param whose every body reference is in argument position of a call. The
// detector only fires when several parameters travel together, matching the
// plumbing-layer pattern rather than incidental one-off forwarding.
export function detectPassThroughVariable({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    let fn: Node | null = null;
    let ownerName = "<anonymous>";
    if (node.type === "FunctionDeclaration") {
      fn = node;
      ownerName = node.id?.name ?? ownerName;
    } else if (node.type === "MethodDefinition") {
      fn = node.value;
      ownerName = node.key?.name ?? node.key?.value ?? ownerName;
    } else return;
    if (!fn?.body?.body) return;
    if ((fn.params?.length ?? 0) < 3) return;
    if (fn.body.body.length < 2) return;

    const passThroughParams: string[] = [];
    for (const param of fn.params ?? []) {
      if (param.type !== "Identifier") continue;
      const name: string = param.name;

      let usageCount = 0;
      let nonForwardingFound = false;
      walk(fn.body, (id, parent) => {
        if (id.type !== "Identifier" || id.name !== name) return;
        usageCount += 1;
        const isForwarding =
          parent?.type === "CallExpression" &&
          Array.isArray(parent.arguments) &&
          parent.arguments.includes(id);
        if (!isForwarding) nonForwardingFound = true;
      });

      if (usageCount > 0 && !nonForwardingFound) passThroughParams.push(name);
    }

    if (passThroughParams.length < 3) return;

    findings.push(
      createFinding({
        flag: "passThroughVariable",
        file,
        line: lineOf(node.start),
        message: `${passThroughParams.length} pass-through params (${passThroughParams.join(", ")}) — plumbing layer with no use of forwarded values`,
        metadata: { passThroughParams },
        identity: [ownerName, passThroughParams],
      }),
    );
  });
  return findings;
}
