import type { Ctx } from "../ast.ts";
import { createFinding } from "../finding.ts";
import type { Finding } from "../types.ts";
import { countModuleSurface } from "./module-surface.ts";

const WIDE_MIN_EXPORTS = 10;

/** Flags modules whose top-level export count exposes too many concepts. */
export function detectWideModule({ file, ast }: Ctx): Finding[] {
  const { topLevelExports: exports } = countModuleSurface(ast);
  if (exports <= WIDE_MIN_EXPORTS) return [];
  return [
    createFinding({
      flag: "wideModule",
      file,
      line: 1,
      message: `${exports} top-level exports — wide module surface`,
      metadata: { exports },
      identity: ["top-level-exports"],
    }),
  ];
}
