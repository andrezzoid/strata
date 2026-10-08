import type { Ctx, SingleDetector } from "../ast.ts";
import type { ImportResolver } from "../scope.ts";
import type { Finding } from "../types.ts";
import {
  detectDuplicateSymbol,
  duplicateSymbolEvidence,
  duplicateSymbolRelatedFiles,
} from "./duplicate-symbol.ts";
import {
  detectExposedMutableRepresentation,
  exposedMutableRepresentationEvidence,
} from "./exposed-mutable-representation.ts";
import {
  detectForcedRareOption,
  forcedRareOptionEvidence,
  forcedRareOptionRelatedFiles,
} from "./forced-rare-option.ts";
import { detectPassThroughExport, passThroughExportEvidence } from "./pass-through-export.ts";
import { detectPassThroughMethod, passThroughMethodEvidence } from "./pass-through-method.ts";
import {
  detectUniqueImplementation,
  uniqueImplementationEvidence,
  uniqueImplementationRelatedFiles,
} from "./unique-implementation.ts";
import { detectWideSignature, wideSignatureEvidence } from "./wide-signature.ts";

export type CrossProjectDetector = (ctxs: Ctx[], imports: ImportResolver) => Finding[];

type DetectorDescriptor = {
  /** Stable detector id; it is every emitted finding's `flag` and the SARIF rule id. */
  id: string;
  /** Display name, used as the SARIF rule name. */
  name: string;
  /** One-line signal; the README detector table row must match it word for word. */
  summary: string;
  /** Review-facing explanation the text report prints above this detector's findings. */
  description: string;
  /**
   * Text-report evidence lines for one of this detector's findings; `[]` when it
   * has none. Lines are final text, prefix and indentation included: only the
   * text report shows evidence, so a structured shape would buy nothing yet.
   */
  evidence: (finding: Finding) => string[];
};

/**
 * Everything strata knows about one detector. Shared modules (scan core, scope
 * filtering, text and SARIF output) ask the registry instead of naming a
 * detector or reading its metadata, so every hook here is required.
 */
export type DetectorDefinition =
  | (DetectorDescriptor & {
      kind: "single";
      detect: SingleDetector;
      /** Single-file findings involve only their anchor file. */
      relatedFiles?: never;
    })
  | (DetectorDescriptor & {
      kind: "cross";
      detect: CrossProjectDetector;
      /**
       * Files a finding involves besides its anchor. `--touched-since` keeps the
       * finding when any of them changed, and `summary.topFiles` counts each one.
       */
      relatedFiles: (finding: Finding) => string[];
    });

/** Public detector catalog; CLI/API filtering names come from this single ordered list. */
export const DETECTOR_DEFINITIONS = [
  {
    id: "wideSignature",
    kind: "single",
    name: "Wide signature",
    summary: "Exported function or public exported-class member has too many required parameters.",
    description:
      "Suspicious when a function requires many positional parameters; callers must know too much ordering and context.",
    detect: detectWideSignature,
    evidence: wideSignatureEvidence,
  },
  {
    id: "passThroughMethod",
    kind: "single",
    name: "Pass-through method",
    summary: "Public class method only forwards same-order args to a collaborator.",
    description:
      "Suspicious when a method only forwards same-order args to a collaborator; the layer may add API surface without hiding useful complexity.",
    detect: detectPassThroughMethod,
    evidence: passThroughMethodEvidence,
  },
  {
    id: "passThroughExport",
    kind: "single",
    name: "Pass-through export",
    summary: "Exported function only forwards same-order args to another callable.",
    description:
      "Suspicious when an exported function only forwards same-order args to another callable; the public name may add surface without behavior.",
    detect: detectPassThroughExport,
    evidence: passThroughExportEvidence,
  },
  {
    id: "exposedMutableRepresentation",
    kind: "single",
    name: "Exposed mutable representation",
    summary: "Exported class returns an exact private mutable field through a public member.",
    description:
      "Suspicious when an exported class returns a private mutable field directly; the declared API permits representation mutation outside the class.",
    detect: detectExposedMutableRepresentation,
    evidence: exposedMutableRepresentationEvidence,
  },
  {
    id: "forcedRareOption",
    kind: "cross",
    name: "Forced rare option",
    summary: "Most callers pass the same literal, placeholder, or default-like option.",
    description:
      "Suspicious when most callers pass the same literal, placeholder, or default-like option; common usage may be paying for rare flexibility.",
    detect: detectForcedRareOption,
    evidence: forcedRareOptionEvidence,
    relatedFiles: forcedRareOptionRelatedFiles,
  },
  {
    id: "duplicateSymbol",
    kind: "cross",
    name: "Duplicate symbol",
    summary: "Named declarations with identical structure are repeated.",
    description:
      "Suspicious when declarations share the same structure; the project may have rebuilt existing concepts instead of reusing them.",
    detect: detectDuplicateSymbol,
    evidence: duplicateSymbolEvidence,
    relatedFiles: duplicateSymbolRelatedFiles,
  },
  {
    id: "uniqueImplementation",
    kind: "cross",
    name: "Unique implementation",
    summary: "Interface or abstract class has no real polymorphism payoff.",
    description:
      "Suspicious when an interface or abstract class has only one implementation; abstraction cost may not buy polymorphism.",
    detect: detectUniqueImplementation,
    evidence: uniqueImplementationEvidence,
    relatedFiles: uniqueImplementationRelatedFiles,
  },
] as const satisfies readonly DetectorDefinition[];

export type DetectorId = (typeof DETECTOR_DEFINITIONS)[number]["id"];

export type DetectorSelection =
  | { kind: "all" }
  | { kind: "only"; ids: readonly DetectorId[] }
  | { kind: "exclude"; ids: readonly DetectorId[] };

export const DETECTOR_IDS = DETECTOR_DEFINITIONS.map((definition) => definition.id) as DetectorId[];

/** Returns the review-facing detector explanation used by human-readable reports. */
export function describeDetector(id: string): string {
  return definitionFor(id)?.description ?? "Detector emitted a review candidate.";
}

/**
 * Files a finding involves: its anchor first, then the detector's related
 * files, without repeats. Unknown flags involve only the anchor.
 */
export function findingFiles(finding: Finding): string[] {
  const definition = definitionFor(finding.flag);
  const related = definition?.kind === "cross" ? definition.relatedFiles(finding) : [];
  return [...new Set([finding.file, ...related])];
}

/** Text-report evidence lines for a finding; unknown flags have none. */
export function findingEvidence(finding: Finding): string[] {
  return definitionFor(finding.flag)?.evidence(finding) ?? [];
}

// Tests append definitions to DETECTOR_DEFINITIONS at runtime, so every view of
// the catalog is derived per call; only DETECTOR_IDS is fixed at load time.
function definitionFor(id: string): DetectorDefinition | undefined {
  return (DETECTOR_DEFINITIONS as readonly DetectorDefinition[]).find(
    (definition) => definition.id === id,
  );
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
