import type { Node } from "../ast.ts";

export type ForwardedCallShape = {
  call: Node;
  calleeName: string;
  paramNames: string[];
};

/**
 * Recognizes the syntactic core of a pass-through callable.
 *
 * Public-surface rules stay in each detector; this helper only answers whether
 * a function-like node has exactly one call that forwards its identifier
 * parameters unchanged and in order to a same-stem operation.
 */
export function forwardedCallShape(fn: Node, wrapperName: string): ForwardedCallShape | null {
  if (!fn?.body) return null;

  const paramNames = identifierParamNames(fn.params ?? []);
  if (!paramNames) return null;

  const call = delegatedCall(fn.body);
  if (!call) return null;

  const calleeName = callableName(call.callee);
  if (!calleeName || !namesShareStem(wrapperName, calleeName)) return null;

  if ((call.arguments?.length ?? 0) !== paramNames.length) return null;
  for (let i = 0; i < paramNames.length; i++) {
    const arg = call.arguments[i];
    if (arg.type !== "Identifier" || arg.name !== paramNames[i]) return null;
  }

  return { call, calleeName, paramNames };
}

/** Stable review-facing identity for simple callees used in finding metadata. */
export function callableIdentity(node: Node): string {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "ThisExpression") return "this";
  if (node?.type === "Super") return "super";
  if (node?.type === "MemberExpression") {
    const property = memberName(node) ?? "?";
    return `${callableIdentity(node.object)}.${property}`;
  }
  return "<?>";
}

/** Returns the root receiver of a member chain such as `this.repo.find`. */
export function memberExpressionRoot(node: Node): Node | null {
  let current = node;
  while (current?.type === "MemberExpression") current = current.object;
  return current ?? null;
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

function delegatedCall(body: Node): Node | null {
  if (body.type === "BlockStatement") {
    if ((body.body?.length ?? 0) !== 1) return null;
    return callFromStatement(body.body[0]);
  }
  return callFromExpression(body);
}

function callFromStatement(stmt: Node): Node | null {
  if (stmt.type === "ReturnStatement") return callFromExpression(stmt.argument);
  if (stmt.type === "ExpressionStatement") return callFromExpression(stmt.expression);
  return null;
}

function callFromExpression(expression: Node | null | undefined): Node | null {
  if (expression?.type === "CallExpression") return expression;
  if (expression?.type === "AwaitExpression") return callFromExpression(expression.argument);
  return null;
}

function callableName(callee: Node): string | null {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") return memberName(callee);
  return null;
}

function memberName(node: Node): string | null {
  const property = node.property;
  if (node.computed && property?.type !== "Literal" && property?.type !== "StringLiteral") {
    return null;
  }
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
