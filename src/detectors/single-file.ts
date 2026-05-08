import type { SingleDetector } from "../ast.ts";
import { detectCatchRethrow, detectEmptyCatch } from "./catch-handling.ts";
import { detectGenericNaming } from "./generic-naming.ts";
import { detectPassThroughMethod } from "./pass-through-method.ts";
import { detectPassThroughVariable } from "./pass-through-variable.ts";
import { detectShallowModule } from "./shallow-module.ts";
import { detectTsEscapeHatches } from "./ts-escape-hatches.ts";
import { detectWideModule } from "./wide-module.ts";
import { detectWideSignature } from "./wide-signature.ts";

/** Registry only: scanProject owns iteration, while each detector owns its AST rules. */
export const SINGLE_DETECTORS: SingleDetector[] = [
  detectShallowModule,
  detectPassThroughMethod,
  detectPassThroughVariable,
  detectEmptyCatch,
  detectCatchRethrow,
  detectGenericNaming,
  detectTsEscapeHatches,
  detectWideModule,
  detectWideSignature,
];
