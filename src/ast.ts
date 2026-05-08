import { parseSync } from "oxc-parser";
import { join } from "node:path";

import type { Finding } from "./types.ts";

export type LineOf = (offset: number) => number;

// oxc-parser's runtime AST shape is richer than its public TypeScript surface.
// Detectors walk it structurally so they can stay resilient to small node-type gaps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Node = any;

/** Parsed file context shared by every detector. */
export type Ctx = {
  /** Project-relative file path used in emitted findings. */
  file: string;
  /** Original source text, needed for snippets and line mapping. */
  source: string;
  /** oxc-parser program node. */
  ast: Node;
  /** Parser comments, used by comment-based detectors such as tsEscapeHatch. */
  comments: Array<{ type: "Line" | "Block"; value: string; start: number; end: number }>;
  /** Maps byte offsets to one-based line numbers. */
  lineOf: LineOf;
};

export type SingleDetector = (ctx: Ctx) => Finding[];
export type CrossDetector = (ctxs: Ctx[]) => Finding[];

/** Builds a fast one-based line lookup from parser byte offsets. */
export function buildLineOf(source: string): LineOf {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Depth-first AST traversal that preserves parent context for detector tests. */
export function walk(node: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null): void {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit, node);
    } else if (value && typeof value === "object") {
      walk(value, visit, node);
    }
  }
}

/** Parses every requested file into detector-ready contexts, skipping unreadable or empty-invalid files. */
export async function parseContexts(root: string, files: string[]): Promise<Ctx[]> {
  const ctxs: Ctx[] = [];
  for (const file of files) {
    const abs = join(root, file);
    let source: string;
    try {
      source = await Bun.file(abs).text();
    } catch {
      continue;
    }

    const parsed = parseSync(file, source);
    if (parsed.errors?.length && parsed.program?.body?.length === 0) continue;
    ctxs.push({
      file,
      source,
      ast: parsed.program,
      comments: parsed.comments ?? [],
      lineOf: buildLineOf(source),
    });
  }
  return ctxs;
}
