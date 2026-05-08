import type { Ctx, SingleDetector } from "../ast.ts";
import type { ImportResolver } from "../scope.ts";
import type { Finding } from "../types.ts";
import { detectCatchRethrow, detectEmptyCatch } from "./catch-handling.ts";
import { detectDuplicateSymbol } from "./duplicate-symbol.ts";
import { detectGenericNaming } from "./generic-naming.ts";
import { detectOrphanFile } from "./orphan-file.ts";
import { detectPassThroughMethod } from "./pass-through-method.ts";
import { detectPassThroughVariable } from "./pass-through-variable.ts";
import { detectShallowModule } from "./shallow-module.ts";
import { detectTsEscapeHatches } from "./ts-escape-hatches.ts";
import { detectUniqueImplementation } from "./unique-implementation.ts";
import { detectWideModule } from "./wide-module.ts";
import { detectWideSignature } from "./wide-signature.ts";

export type CrossProjectDetector = (ctxs: Ctx[], imports: ImportResolver) => Finding[];

type DetectorDefinition =
  | { id: string; kind: "single"; detect: SingleDetector }
  | { id: string; kind: "cross"; detect: CrossProjectDetector };

/** Public detector catalog; CLI/API filtering names come from this single ordered list. */
export const DETECTOR_DEFINITIONS = [
  { id: "shallowModule", kind: "single", detect: detectShallowModule },
  { id: "passThroughMethod", kind: "single", detect: detectPassThroughMethod },
  { id: "passThroughVariable", kind: "single", detect: detectPassThroughVariable },
  { id: "emptyCatch", kind: "single", detect: detectEmptyCatch },
  { id: "catchRethrow", kind: "single", detect: detectCatchRethrow },
  { id: "genericNaming", kind: "single", detect: detectGenericNaming },
  { id: "tsEscapeHatch", kind: "single", detect: detectTsEscapeHatches },
  { id: "wideModule", kind: "single", detect: detectWideModule },
  { id: "wideSignature", kind: "single", detect: detectWideSignature },
  { id: "duplicateSymbol", kind: "cross", detect: detectDuplicateSymbol },
  { id: "uniqueImplementation", kind: "cross", detect: detectUniqueImplementation },
  { id: "orphanFile", kind: "cross", detect: detectOrphanFile },
] as const satisfies readonly DetectorDefinition[];

export type DetectorId = (typeof DETECTOR_DEFINITIONS)[number]["id"];

export type DetectorSelection =
  | { kind: "all" }
  | { kind: "only"; ids: readonly DetectorId[] }
  | { kind: "exclude"; ids: readonly DetectorId[] };

export const DETECTOR_IDS = DETECTOR_DEFINITIONS.map((definition) => definition.id) as DetectorId[];

type SelectedDetectorSet = {
  single: Array<{ id: DetectorId; detect: SingleDetector }>;
  cross: Array<{ id: DetectorId; detect: CrossProjectDetector }>;
};

/** Resolves caller-facing detector selection into the exact detectors scanProject should run. */
export function selectDetectors(
  selection: DetectorSelection = { kind: "all" },
): SelectedDetectorSet {
  const selectedIds = selection.kind === "all" ? null : new Set(selection.ids);
  const single: SelectedDetectorSet["single"] = [];
  const cross: SelectedDetectorSet["cross"] = [];

  for (const definition of DETECTOR_DEFINITIONS) {
    if (!includesDetector(definition.id, selection.kind, selectedIds)) continue;

    if (definition.kind === "single") {
      single.push({ id: definition.id, detect: definition.detect });
    } else {
      cross.push({ id: definition.id, detect: definition.detect });
    }
  }

  return { single, cross };
}

function includesDetector(
  id: DetectorId,
  selectionKind: DetectorSelection["kind"],
  selectedIds: Set<DetectorId> | null,
): boolean {
  if (selectionKind === "all") return true;
  if (selectionKind === "only") return selectedIds?.has(id) ?? false;
  return !(selectedIds?.has(id) ?? false);
}
