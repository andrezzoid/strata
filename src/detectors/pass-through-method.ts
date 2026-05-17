import type { Ctx, Node } from "../ast.ts";
import { walk } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";
import {
  callableIdentity,
  forwardedCallShape,
  memberExpressionRoot,
} from "./pass-through-shape.ts";

const CONCENTRATED_METHOD_MIN = 3;
const CONCENTRATED_RATIO_MIN = 0.5;

type PassThroughCandidate = {
  node: Node;
  methodName: string;
  call: Node;
  paramNames: string[];
};

// PoSD Ch. 7: a public class method delegating to a collaborator with no logic.
// Free functions are excluded because they can be useful naming/type abstractions.
export function detectPassThroughMethod({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    if (node.type !== "ClassDeclaration" && node.type !== "ClassExpression") return;
    const publicMethods = (node.body?.body ?? []).filter((member: Node) =>
      publicMethodName(member),
    );
    if (publicMethods.length === 0) return;

    const candidates = publicMethods.flatMap((member: Node) => {
      const candidate = passThroughCandidate(member);
      return candidate ? [candidate] : [];
    });
    if (candidates.length === 0) return;

    const className = node.id?.name ?? "<anonymous>";
    const passThroughRatio = candidates.length / publicMethods.length;
    const concentrated =
      candidates.length >= CONCENTRATED_METHOD_MIN || passThroughRatio > CONCENTRATED_RATIO_MIN;

    for (const candidate of candidates) {
      findings.push(
        createFinding({
          flag: "passThroughMethod",
          file,
          line: lineOf(candidate.node.start),
          message: "class method delegates to instance state with same args — layer without logic",
          metadata: {
            className,
            methodName: candidate.methodName,
            receiver: callableIdentity(candidate.call.callee.object),
            callee: callableIdentity(candidate.call.callee),
            passThroughMethodCount: candidates.length,
            publicMethodCount: publicMethods.length,
            passThroughRatio,
            concentrated,
          },
          identity: [
            candidate.methodName,
            callableIdentity(candidate.call.callee),
            candidate.paramNames,
          ],
        }),
      );
    }
  });
  return findings;
}

function passThroughCandidate(node: Node): PassThroughCandidate | null {
  const methodName = publicMethodName(node);
  if (!methodName) return null;

  const fn = node.value;
  const forwarded = forwardedCallShape(fn, methodName);
  if (!forwarded || forwarded.call.callee?.type !== "MemberExpression") return null;
  const { call, paramNames } = forwarded;
  if (!isCollaboratorCall(call.callee)) return null;

  return { node, methodName, call, paramNames };
}

function publicMethodName(node: Node): string | null {
  if (node.type !== "MethodDefinition") return null;
  if (node.kind === "constructor") return null;
  if (node.accessibility === "private" || node.accessibility === "protected") return null;
  if (node.key?.type === "PrivateIdentifier") return null;
  const name = node.key?.name ?? node.key?.value;
  if (typeof name !== "string") return null;
  return name;
}

function isCollaboratorCall(callee: Node): boolean {
  const receiver = callee.object;
  return (
    receiver?.type === "MemberExpression" &&
    memberExpressionRoot(receiver)?.type === "ThisExpression"
  );
}
