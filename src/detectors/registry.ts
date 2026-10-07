import type { Ctx, SingleDetector } from "../ast.ts";
import type { ImportResolver } from "../scope.ts";
import type { Finding } from "../types.ts";
import { duplicateSymbolDetector } from "./duplicate-symbol.ts";
import { exposedMutableRepresentationDetector } from "./exposed-mutable-representation.ts";
import { forcedRareOptionDetector } from "./forced-rare-option.ts";
import { passThroughExportDetector } from "./pass-through-export.ts";
import { passThroughMethodDetector } from "./pass-through-method.ts";
import { uniqueImplementationDetector } from "./unique-implementation.ts";
import { wideSignatureDetector } from "./wide-signature.ts";

export type CrossProjectDetector = (ctxs: Ctx[], imports: ImportResolver) => Finding[];

type DetectorDescription = {
  /** Detector id; also the finding flag, CLI filter name and SARIF rule id. */
  id: string;
  /** Title-case display name, used as the SARIF rule name. */
  name: string;
  /** One-sentence signal; the README detector table row and SARIF rule description must match it. */
  summary: string;
  /** Review-facing explanation shown above the detector's findings in the text report. */
  description: string;
  /** Text-report lines under a finding; JSON keeps the full metadata. */
  evidence: (finding: Finding) => string[];
};

/**
 * Everything shared modules know about one detector.
 *
 * Scan core, scope filtering, text formatting and SARIF output read these
 * hooks instead of naming detector ids or metadata keys, so adding or changing
 * a detector means editing its definition and its docs page.
 */
export type DetectorDefinition =
  | (DetectorDescription & {
      kind: "single";
      detect: SingleDetector;
      /** Single-file findings involve only their anchor file. */
      relatedFiles?: never;
    })
  | (DetectorDescription & {
      kind: "cross";
      detect: CrossProjectDetector;
      /** Files a finding involves besides its anchor; `--touched-since` and `topFiles` use them. */
      relatedFiles: (finding: Finding) => string[];
    });

/** Public detector catalog; CLI/API filtering names come from this single ordered list. */
export const DETECTOR_DEFINITIONS = [
  passThroughMethodDetector,
  passThroughExportDetector,
  exposedMutableRepresentationDetector,
  wideSignatureDetector,
  forcedRareOptionDetector,
  duplicateSymbolDetector,
  uniqueImplementationDetector,
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

/** Files a finding involves: its anchor first, then related files, without repeats. */
export function findingFiles(finding: Finding): string[] {
  const definition = definitionFor(finding.flag);
  const related = definition?.kind === "cross" ? definition.relatedFiles(finding) : [];
  return [...new Set([finding.file, ...related])];
}

/** Text-report evidence lines for a finding; unknown detectors have none. */
export function findingEvidence(finding: Finding): string[] {
  return definitionFor(finding.flag)?.evidence(finding) ?? [];
}

// Looked up per call rather than cached, so test-only definitions pushed onto
// the catalog are visible to every shared module.
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
