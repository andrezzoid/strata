import type { Ctx, Node } from "../ast.ts";
import { walk } from "../ast.ts";
import type { Finding } from "../types.ts";

const GENERIC_SUFFIXES = [
  "Manager",
  "Helper",
  "Wrapper",
  "Container",
  "Holder",
  "Utils",
  "Util",
  "Misc",
  "Common",
  "Processor",
  "Handler",
];

/** Flags type declarations named with generic catch-all suffixes. */
export function detectGenericNaming({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  const genericSuffix = new RegExp(`(${GENERIC_SUFFIXES.join("|")})$`);
  walk(ast, (node) => {
    let id: Node | null = null;
    if (
      (node.type === "ClassDeclaration" || node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration") &&
      node.id
    ) {
      id = node.id;
    }
    if (!id?.name) return;
    if (!genericSuffix.test(id.name)) return;
    findings.push({
      flag: "genericNaming",
      severity: "candidate",
      file,
      line: lineOf(node.start),
      message: `name '${id.name}' uses a generic suffix (Manager/Helper/Utils/...)`,
      metadata: { name: id.name },
    });
  });
  return findings;
}
