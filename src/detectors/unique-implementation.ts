import type { Ctx } from "../ast.ts";
import { TEST_FILE_PATTERN } from "../skip-patterns.ts";
import { buildFileScope, resolveDeclarationSite } from "../scope.ts";
import type { Finding } from "../types.ts";

type AbstractionDecl = {
  kind: "interface" | "abstractClass";
  name: string;
  file: string;
  line: number;
  methodCount: number;
};

/** Flags polymorphism constructs whose implementation count does not justify the abstraction cost. */
export function detectUniqueImplementation(ctxs: Ctx[]): Finding[] {
  const fileSet = new Set(ctxs.map((ctx) => ctx.file));
  const scopes = new Map<string, ReturnType<typeof buildFileScope>>();
  const declarations: AbstractionDecl[] = [];
  const implementersByDecl = new Map<string, Array<{ implementer: string; file: string; line: number }>>();

  for (const ctx of ctxs) {
    scopes.set(ctx.file, buildFileScope(ctx, fileSet));
  }

  for (const ctx of ctxs) {
    if (TEST_FILE_PATTERN.test(ctx.file)) continue;

    for (const stmt of ctx.ast.body ?? []) {
      const decl =
        stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration"
          ? stmt.declaration
          : stmt;
      if (!decl?.id?.name) continue;

      if (decl.type === "TSInterfaceDeclaration") {
        declarations.push({
          kind: "interface",
          name: decl.id.name,
          file: ctx.file,
          line: ctx.lineOf(decl.start),
          methodCount: decl.body?.body?.length ?? 0,
        });
        continue;
      }

      if (decl.type === "ClassDeclaration" && decl.abstract) {
        let publicMembers = 0;
        for (const member of decl.body?.body ?? []) {
          if (
            member.type !== "MethodDefinition" &&
            member.type !== "PropertyDefinition" &&
            member.type !== "TSAbstractMethodDefinition"
          ) {
            continue;
          }
          const isPrivate =
            member.accessibility === "private" ||
            (typeof member.key?.name === "string" && member.key.name.startsWith("_"));
          if (!isPrivate) publicMembers += 1;
        }
        declarations.push({
          kind: "abstractClass",
          name: decl.id.name,
          file: ctx.file,
          line: ctx.lineOf(decl.start),
          methodCount: publicMembers,
        });
        continue;
      }

      if (decl.type === "ClassDeclaration" && decl.id?.name && !decl.abstract) {
        const implName = decl.id.name;
        const implLine = ctx.lineOf(decl.start);

        const recordReference = (refName: string) => {
          const site = resolveDeclarationSite(ctx.file, refName, scopes);
          if (!site) return;
          const key = `${site.file}:${site.name}`;
          const list = implementersByDecl.get(key) ?? [];
          list.push({ implementer: implName, file: ctx.file, line: implLine });
          implementersByDecl.set(key, list);
        };

        for (const impl of decl.implements ?? []) {
          const refName = impl.expression?.name ?? impl.expression?.expression?.name ?? null;
          if (refName) recordReference(refName);
        }

        if (decl.superClass?.type === "Identifier") {
          recordReference(decl.superClass.name);
        }
      }
    }
  }

  const findings: Finding[] = [];
  for (const declaration of declarations) {
    const key = `${declaration.file}:${declaration.name}`;
    const implementers = implementersByDecl.get(key) ?? [];

    // Interfaces are structural in TS; exactly one explicit implementer is the unambiguous speculative case.
    if (declaration.kind === "interface" && implementers.length !== 1) continue;
    // Abstract classes cannot be instantiated, so zero or one subclass both carry no real polymorphism payoff.
    if (declaration.kind === "abstractClass" && implementers.length > 1) continue;

    const kindWord = declaration.kind === "interface" ? "interface" : "abstract class";
    const status =
      implementers.length === 0
        ? "no subclasses — abstract class is dead"
        : `only one ${declaration.kind === "interface" ? "implementer" : "subclass"}: ${implementers[0].implementer} at ${implementers[0].file}:${implementers[0].line}`;

    findings.push({
      flag: "uniqueImplementation",
      severity: "candidate",
      file: declaration.file,
      line: declaration.line,
      message: `${kindWord} '${declaration.name}' has ${status} — speculative abstraction (no polymorphism payoff)`,
      metadata: {
        kind: declaration.kind,
        name: declaration.name,
        memberCount: declaration.methodCount,
        implementerCount: implementers.length,
        implementers,
      },
    });
  }
  return findings;
}
