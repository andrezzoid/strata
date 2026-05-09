#!/usr/bin/env bun
import { statSync } from "node:fs";

import { DETECTOR_IDS, type DetectorId, type DetectorSelection } from "./detectors/registry.ts";
import { formatResult } from "./format.ts";
import { scanProject } from "./scan.ts";
import type { OutputFormat } from "./types.ts";

const DETECTOR_ID_SET = new Set<string>(DETECTOR_IDS);

function printUsage(stream: { write(text: string): void }): void {
  stream.write(
    "strata [PATH] [--diff <git-ref>|--new-since <git-ref>] [--format json|text|sarif] [--only <detectors>|--exclude <detectors>] [--fail-on-findings]\n" +
      "  Scan TypeScript files for PoSD-style complexity smell candidates.\n",
  );
}

function usage(exitCode: 0 | 2): never {
  printUsage(exitCode === 0 ? process.stdout : process.stderr);
  process.exit(exitCode);
}

function detectorUsageError(message: string): never {
  process.stderr.write(`${message}\n`);
  printUsage(process.stderr);
  process.stderr.write(`valid detectors: ${DETECTOR_IDS.join(", ")}\n`);
  process.exit(2);
}

function usageError(message: string): never {
  process.stderr.write(`${message}\n`);
  printUsage(process.stderr);
  process.exit(2);
}

function parseDetectorIds(flag: "--only" | "--exclude", value: string): DetectorId[] {
  const ids: DetectorId[] = [];
  for (const raw of value.split(",")) {
    const detector = raw.trim();
    if (!detector) detectorUsageError(`empty detector in ${flag} list`);
    if (!DETECTOR_ID_SET.has(detector)) detectorUsageError(`unknown detector: ${detector}`);
    ids.push(detector as DetectorId);
  }
  return ids;
}

/**
 * Runs the process-oriented CLI: reads argv, writes output, and exits for usage errors.
 * Kept exportable so package bin launchers can stay tiny and share this exact behavior.
 */
export async function main(): Promise<void> {
  let target = "";
  let diffRef: string | null = null;
  let newSinceRef: string | null = null;
  let format: OutputFormat = "json";
  let failOnFindings = false;
  let detectorSelection: DetectorSelection = { kind: "all" };
  let detectorFilterFlag: "--only" | "--exclude" | null = null;

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--diff") {
      const value = args[++i];
      if (!value) usage(2);
      diffRef = value;
    } else if (arg === "--new-since") {
      const value = args[++i];
      if (!value || value.startsWith("-")) usageError("--new-since requires a git ref");
      newSinceRef = value;
    } else if (arg === "--format") {
      const value = args[++i];
      if (value !== "json" && value !== "text" && value !== "sarif") usage(2);
      format = value;
    } else if (arg === "--only" || arg === "--exclude") {
      if (detectorFilterFlag) {
        detectorUsageError(
          detectorFilterFlag === arg
            ? `${arg} can only be provided once`
            : "cannot combine --only and --exclude",
        );
      }
      const value = args[++i];
      if (!value || value.startsWith("-")) {
        detectorUsageError(`${arg} requires a comma-separated detector list`);
      }
      detectorFilterFlag = arg;
      detectorSelection = {
        kind: arg === "--only" ? "only" : "exclude",
        ids: parseDetectorIds(arg, value),
      };
    } else if (arg === "--fail-on-findings") {
      failOnFindings = true;
    } else if (arg === "-h" || arg === "--help") {
      usage(0);
    } else if (arg.startsWith("-")) {
      process.stderr.write(`unknown flag: ${arg}\n`);
      process.exit(2);
    } else {
      target = arg;
    }
  }

  target = target || ".";
  if (diffRef && newSinceRef) usageError("cannot combine --diff and --new-since");
  if (!statSync(target, { throwIfNoEntry: false })) {
    process.stderr.write(`no such path: ${target}\n`);
    process.exit(2);
  }

  const result = await scanProject({ target, diffRef, newSinceRef, detectorSelection });
  process.stdout.write(formatResult(result, format));
  if (failOnFindings && result.summary.totalFindings > 0) process.exit(1);
}

if (import.meta.main) {
  void main();
}
