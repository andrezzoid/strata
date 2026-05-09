/** A scanner finding is always a review candidate, never a verdict. */
export type Severity = "candidate";

/** Stable finding shape consumed by agents, tests, and CLI output. */
export type Finding = {
  /** Detector identifier, such as `passThroughMethod` or `duplicateSymbol`. */
  flag: string;
  /** Fixed at candidate to preserve the scanner's no-verdict contract. */
  severity: Severity;
  /** Versioned identity for matching the same candidate across harmless line shifts. */
  fingerprint: string;
  /** Project-relative path that anchors the finding. */
  file: string;
  /** One-based source line. */
  line: number;
  /** Human-readable candidate explanation. */
  message: string;
  /** Detector-specific data; stable JSON values only. */
  metadata: Record<string, unknown>;
};

/** Counts and hot files for orienting the audit before reading findings. */
export type ScanSummary = {
  /** Total number of emitted candidate findings. */
  totalFindings: number;
  /** Finding count grouped by detector flag. */
  byFlag: Record<string, number>;
  /** Files with the most findings, descending by count. */
  topFiles: Array<{ file: string; count: number }>;
};

/** Complete scan result; this is the public JSON output schema. */
export type ScanResult = {
  summary: ScanSummary;
  findings: Finding[];
};

/** CLI output formats intentionally kept small for deterministic consumers. */
export type OutputFormat = "json" | "text" | "sarif";

/** Intentional PR-trial candidate used to validate GitHub Action annotations. */
export class TrialRedFlagService {
  constructor(private readonly repo: { findTrial(id: string): string }) {}

  findTrial(id: string): string {
    return this.repo.findTrial(id);
  }
}
