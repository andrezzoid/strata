import type { OutputFormat, ScanResult } from "./types.ts";
import type { Finding } from "./types.ts";
import { describeDetector } from "./detectors/registry.ts";
import { formatSarif } from "./sarif.ts";

export type TextReportContext =
  | { mode: "full"; target: string }
  | { mode: "touched"; target: string; ref: string }
  | { mode: "introduced"; target: string; ref: string };

export type FormatOptions = {
  /** Text-only scan context; JSON/SARIF stay the raw ScanResult-derived contracts. */
  text?: TextReportContext;
};

/** Converts a scan result to the requested CLI output without mutating result ordering. */
export function formatResult(
  result: ScanResult,
  format: OutputFormat,
  options: FormatOptions = {},
): string {
  if (format === "json") return JSON.stringify(result, null, 2) + "\n";
  if (format === "sarif") return formatSarif(result);
  return formatText(result, options.text ?? { mode: "full", target: "." });
}

/** Formats operational failures separately from completed candidate reports. */
export function formatScanFailure(reason: string, context: TextReportContext): string {
  const lines = ["strata scan failed", `Mode: ${modeLabel(context)}`, `Target: ${context.target}`];
  if (context.mode === "introduced") lines.push(`Base ref: ${context.ref}`);
  if (context.mode === "touched") lines.push(`Changed since: ${context.ref}`);
  lines.push("", `Reason: ${reason}`, "", "No trustworthy candidate report was produced.");
  return `${lines.join("\n")}\n`;
}

function formatText(result: ScanResult, context: TextReportContext): string {
  const lines: string[] = [];

  lines.push("strata complexity candidates");
  lines.push(`Mode: ${modeLabel(context)}`);
  lines.push(`Target: ${context.target}`);
  if (context.mode === "introduced") lines.push(`Base ref: ${context.ref}`);
  if (context.mode === "touched") lines.push(`Changed since: ${context.ref}`);

  const total = result.summary.totalFindings;
  lines.push("");
  if (total === 0) {
    lines.push("No review candidates were emitted for this scan.", "");
    lines.push(
      "This is not a verdict that the design is clean. It only means no enabled",
      "detector matched the selected scope.",
    );
    return lines.join("\n") + "\n";
  }

  lines.push(foundLine(total, context), "");
  lines.push(...framingLines(context));

  const byDetector = Object.entries(result.summary.byFlag);
  const detectorWidth = Math.max(...byDetector.map(([flag]) => flag.length));
  lines.push("", "By detector:");
  for (const [flag, count] of byDetector) lines.push(`  ${flag.padEnd(detectorWidth)}  ${count}`);

  lines.push("", "Top files:");
  for (const { file, count } of result.summary.topFiles) lines.push(`  ${count}  ${file}`);

  for (const [flag, findings] of groupByDetector(result.findings)) {
    lines.push("", flag, `  ${describeDetector(flag)}`, "");
    findings.forEach((finding, index) => {
      if (index > 0) lines.push("");
      lines.push(`  ${finding.file}:${finding.line}`);
      lines.push(`    ${textMessage(finding.message)}`);
      for (const evidence of evidenceLines(finding)) lines.push(`    ${evidence}`);
    });
  }

  return lines.join("\n") + "\n";
}

function modeLabel(context: TextReportContext): string {
  if (context.mode === "introduced") return "introduced candidates";
  if (context.mode === "touched") return "touched files";
  return "full scan";
}

function foundLine(total: number, context: TextReportContext): string {
  const noun = total === 1 ? "candidate" : "candidates";
  if (context.mode === "introduced") {
    return `Found ${total} review ${noun} introduced since ${context.ref}.`;
  }
  if (context.mode === "touched") {
    return `Found ${total} review ${noun} touching files changed since ${context.ref}.`;
  }
  return `Found ${total} review ${noun}.`;
}

function framingLines(context: TextReportContext): string[] {
  if (context.mode === "introduced") {
    return [
      "These are candidate signals, not automated design verdicts. Inherited",
      "candidates are omitted by fingerprint; omitted does not mean approved.",
    ];
  }
  if (context.mode === "touched") {
    return [
      "These are candidate signals, not automated design verdicts. Only",
      "candidates touching changed files are shown; omitted does not mean approved.",
    ];
  }
  return [
    "These are candidate signals, not automated design verdicts. Review whether",
    "each finding actually makes the system harder to understand or modify.",
  ];
}

function groupByDetector(findings: Finding[]): Array<[string, Finding[]]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.flag);
    if (group) group.push(finding);
    else groups.set(finding.flag, [finding]);
  }
  return [...groups.entries()];
}

function textMessage(message: string): string {
  return message
    .replace(/\s+—\s+/g, " - ")
    .replace(/—/g, "-")
    .replace(/×/g, "x")
    .replace(/…/g, "...");
}

function evidenceLines(finding: Finding): string[] {
  if (finding.flag === "duplicateSymbol") return duplicateSymbolEvidence(finding);
  if (finding.flag === "passThroughMethod") return passThroughMethodEvidence(finding);
  if (finding.flag === "shallowModule") {
    const surface = finding.metadata.surface;
    const bodyLines = finding.metadata.bodyLines;
    if (typeof surface === "number" && typeof bodyLines === "number") {
      return [`evidence: ${surface} surface elements, ${bodyLines} body lines`];
    }
  }
  if (finding.flag === "wideModule" && typeof finding.metadata.exports === "number") {
    return [`evidence: ${finding.metadata.exports} top-level exports`];
  }
  if (finding.flag === "wideSignature" && typeof finding.metadata.requiredParams === "number") {
    return [`evidence: ${finding.metadata.requiredParams} required parameters`];
  }
  if (finding.flag === "genericNaming" && typeof finding.metadata.name === "string") {
    return [`evidence: generic name: ${finding.metadata.name}`];
  }
  if (finding.flag === "tsEscapeHatch" && typeof finding.metadata.kind === "string") {
    return [`evidence: ${finding.metadata.kind}`];
  }
  if (
    finding.flag === "uniqueImplementation" &&
    typeof finding.metadata.implementerCount === "number"
  ) {
    return [`evidence: implementer count: ${finding.metadata.implementerCount}`];
  }
  return [];
}

function passThroughMethodEvidence(finding: Finding): string[] {
  if (finding.metadata.concentrated !== true) return [];
  const count = finding.metadata.passThroughMethodCount;
  const publicCount = finding.metadata.publicMethodCount;
  const ratio = finding.metadata.passThroughRatio;
  const className = finding.metadata.className;
  if (
    typeof count !== "number" ||
    typeof publicCount !== "number" ||
    typeof ratio !== "number" ||
    typeof className !== "string"
  ) {
    return [];
  }
  return [
    `evidence: ${count}/${publicCount} public methods in ${className} are pass-through (${Math.round(ratio * 100)}%)`,
  ];
}

function duplicateSymbolEvidence(finding: Finding): string[] {
  const evidence: string[] = [];
  const preview = String(finding.metadata.preview ?? "");
  const from = String(finding.metadata.previewFrom ?? "");
  if (preview) {
    evidence.push(`preview (from ${from}):`);
    for (const previewLine of preview.split("\n")) evidence.push(`  ${previewLine}`);
  }

  const occurrences =
    (finding.metadata.occurrences as
      | Array<{ name: string; file: string; line: number }>
      | undefined) ?? [];
  if (occurrences.length > 0) {
    evidence.push(`occurrences (${occurrences.length}):`);
    for (const occurrence of occurrences)
      evidence.push(`  ${occurrence.file}:${occurrence.line}  ${occurrence.name}`);
  }
  return evidence;
}
