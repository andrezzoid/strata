import type { OutputFormat, ScanResult } from "./types.ts";
import { formatSarif } from "./sarif.ts";

/** Converts a scan result to the requested CLI output without mutating result ordering. */
export function formatResult(result: ScanResult, format: OutputFormat): string {
  if (format === "json") return JSON.stringify(result, null, 2) + "\n";
  if (format === "sarif") return formatSarif(result);
  return formatText(result);
}

function formatText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`Total: ${result.summary.totalFindings} findings\n`);
  for (const [flag, count] of Object.entries(result.summary.byFlag))
    lines.push(`  ${flag}: ${count}`);
  lines.push("\nTop files:");
  for (const { file, count } of result.summary.topFiles) lines.push(`  ${count}  ${file}`);
  lines.push("\nFindings:");
  for (const finding of result.findings) {
    lines.push(`  [${finding.flag}] ${finding.file}:${finding.line} — ${finding.message}`);
    if (finding.flag === "duplicateSymbol") {
      const preview = String(finding.metadata.preview ?? "");
      const from = String(finding.metadata.previewFrom ?? "");
      if (preview) {
        lines.push(`      preview (from ${from}):`);
        for (const previewLine of preview.split("\n")) lines.push(`        ${previewLine}`);
      }
      const occurrences =
        (finding.metadata.occurrences as
          | Array<{ name: string; file: string; line: number }>
          | undefined) ?? [];
      if (occurrences.length > 0) {
        lines.push(`      occurrences (${occurrences.length}):`);
        for (const occurrence of occurrences)
          lines.push(`        ${occurrence.file}:${occurrence.line}  ${occurrence.name}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}
