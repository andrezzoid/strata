import type { Ctx, SingleDetector } from "../ast.ts";
import type { ImportResolver } from "../scope.ts";
import type { Finding } from "../types.ts";
import { detectDuplicateSymbol } from "./duplicate-symbol.ts";
import { detectGenericNaming } from "./generic-naming.ts";
import { detectOrphanFile } from "./orphan-file.ts";
import { detectPassThroughMethod } from "./pass-through-method.ts";
import { detectShallowModule } from "./shallow-module.ts";
import { detectUniqueImplementation } from "./unique-implementation.ts";
import { detectWideModule } from "./wide-module.ts";
import { detectWideSignature } from "./wide-signature.ts";

export type CrossProjectDetector = (ctxs: Ctx[], imports: ImportResolver) => Finding[];

type DetectorDefinition =
  | { id: string; kind: "single"; description: string; detect: SingleDetector }
  | { id: string; kind: "cross"; description: string; detect: CrossProjectDetector };

/** Public detector catalog; CLI/API filtering names come from this single ordered list. */
export const DETECTOR_DEFINITIONS = [
  {
    id: "shallowModule",
    kind: "single",
    description:
      "Suspicious when a module exposes a large interface relative to its implementation; readers pay API cost without much hidden complexity.",
    detect: detectShallowModule,
  },
  {
    id: "passThroughMethod",
    kind: "single",
    description:
      "Suspicious when a method only forwards same-order args to a collaborator; the layer may add API surface without hiding useful complexity.",
    detect: detectPassThroughMethod,
  },
  {
    id: "genericNaming",
    kind: "single",
    description:
      "Suspicious when declarations use vague suffixes; generic names often hide an unfocused responsibility.",
    detect: detectGenericNaming,
  },
  {
    id: "wideModule",
    kind: "single",
    description:
      "Suspicious when a module exports many top-level names; callers must understand a broad surface before using it.",
    detect: detectWideModule,
  },
  {
    id: "wideSignature",
    kind: "single",
    description:
      "Suspicious when a function requires many positional parameters; callers must know too much ordering and context.",
    detect: detectWideSignature,
  },
  {
    id: "duplicateSymbol",
    kind: "cross",
    description:
      "Suspicious when declarations share the same structure; the project may have rebuilt existing concepts instead of reusing them.",
    detect: detectDuplicateSymbol,
  },
  {
    id: "uniqueImplementation",
    kind: "cross",
    description:
      "Suspicious when an interface or abstract class has only one implementation; abstraction cost may not buy polymorphism.",
    detect: detectUniqueImplementation,
  },
  {
    id: "orphanFile",
    kind: "cross",
    description:
      "Suspicious when a source file is not imported by the scanned project; it may be dead code, forgotten exploration, or an entrypoint the scanner cannot infer.",
    detect: detectOrphanFile,
  },
] as const satisfies readonly DetectorDefinition[];

export type DetectorId = (typeof DETECTOR_DEFINITIONS)[number]["id"];

export type DetectorSelection =
  | { kind: "all" }
  | { kind: "only"; ids: readonly DetectorId[] }
  | { kind: "exclude"; ids: readonly DetectorId[] };

export const DETECTOR_IDS = DETECTOR_DEFINITIONS.map((definition) => definition.id) as DetectorId[];

const DETECTOR_DESCRIPTIONS = new Map<string, string>(
  DETECTOR_DEFINITIONS.map((definition) => [definition.id, definition.description]),
);

/** Returns the review-facing detector explanation used by human-readable reports. */
export function describeDetector(id: string): string {
  return DETECTOR_DESCRIPTIONS.get(id) ?? "Detector emitted a review candidate.";
}

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
