import type { Ctx, Node } from "../ast.ts";
import { walk } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";

// PoSD Ch. 7: a public class method delegating to a collaborator with no logic.
// Free functions are excluded because they can be useful naming/type abstractions.
export function detectPassThroughMethod({ file, ast, lineOf }: Ctx): Finding[] {
  const findings: Finding[] = [];
  walk(ast, (node) => {
    const methodName = publicMethodName(node);
    if (!methodName) return;

    const fn = node.value;
    if (!fn?.body?.body || fn.body.body.length !== 1) return;

    const paramNames = identifierParamNames(fn.params ?? []);
    if (!paramNames) return;

    const call = delegatedCall(fn.body.body[0]);
    if (!call || call.callee?.type !== "MemberExpression") return;
    if (!isCollaboratorCall(call.callee)) return;

    const calleeName = memberName(call.callee);
    if (!calleeName || !namesShareStem(methodName, calleeName)) return;

    if ((call.arguments?.length ?? 0) !== paramNames.length) return;
    for (let i = 0; i < paramNames.length; i++) {
      const arg = call.arguments[i];
      if (arg.type !== "Identifier" || arg.name !== paramNames[i]) return;
    }

    findings.push(
      createFinding({
        flag: "passThroughMethod",
        file,
        line: lineOf(node.start),
        message: "class method delegates to instance state with same args — layer without logic",
        metadata: {},
        identity: [methodName, memberExpressionIdentity(call.callee), paramNames],
      }),
    );
  });
  return findings;
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

function identifierParamNames(params: Node[]): string[] | null {
  const names: string[] = [];
  for (const param of params) {
    if (param.type === "Identifier") names.push(param.name);
    else if (param.type === "TSParameterProperty" && param.parameter?.type === "Identifier") {
      names.push(param.parameter.name);
    } else {
      return null;
    }
  }
  return names;
}

function delegatedCall(stmt: Node): Node | null {
  if (stmt.type === "ReturnStatement") return callFromReturnArgument(stmt.argument);
  if (stmt.type === "ExpressionStatement" && stmt.expression?.type === "CallExpression") {
    return stmt.expression;
  }
  return null;
}

function callFromReturnArgument(argument: Node | null | undefined): Node | null {
  if (argument?.type === "CallExpression") return argument;
  if (argument?.type === "AwaitExpression" && argument.argument?.type === "CallExpression") {
    return argument.argument;
  }
  return null;
}

function isCollaboratorCall(callee: Node): boolean {
  const receiver = callee.object;
  return (
    receiver?.type === "MemberExpression" &&
    memberExpressionRoot(receiver)?.type === "ThisExpression"
  );
}

function memberExpressionRoot(node: Node): Node | null {
  let current = node;
  while (current?.type === "MemberExpression") current = current.object;
  return current ?? null;
}

function memberName(node: Node): string | null {
  const property = node.property;
  if (node.computed && property?.type !== "Literal" && property?.type !== "StringLiteral")
    return null;
  const name = property?.name ?? property?.value;
  return typeof name === "string" ? name : null;
}

function namesShareStem(wrapperName: string, calleeName: string): boolean {
  const wrapperTokens = nameTokens(wrapperName);
  const calleeTokens = nameTokens(calleeName);
  return tokenPrefix(wrapperTokens, calleeTokens) || tokenPrefix(calleeTokens, wrapperTokens);
}

function tokenPrefix(longer: string[], shorter: string[]): boolean {
  return shorter.length > 0 && shorter.every((token, index) => longer[index] === token);
}

function nameTokens(name: string): string[] {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function memberExpressionIdentity(node: Node): string {
  if (node.type !== "MemberExpression") return "<?>";
  const property = memberName(node) ?? "?";
  if (node.object?.type === "ThisExpression") return `this.${property}`;
  if (node.object?.type === "MemberExpression")
    return `${memberExpressionIdentity(node.object)}.${property}`;
  return `?.${property}`;
}
