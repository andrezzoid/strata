#!/usr/bin/env bun
import { existsSync } from "node:fs";

import { formatResult } from "./format.ts";
import { scanProject } from "./scan.ts";
import type { OutputFormat } from "./types.ts";

function printUsage(stream: { write(text: string): void }): void {
  stream.write(
    "strata [PATH] [--diff <git-ref>] [--format json|text]\n" +
      "  Scan TypeScript files for PoSD-style complexity smell candidates.\n",
  );
}

function usage(exitCode: 0 | 2): never {
  printUsage(exitCode === 0 ? process.stdout : process.stderr);
  process.exit(exitCode);
}

function main(): void {
  let target = "";
  let diffRef: string | null = null;
  let format: OutputFormat = "json";

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--diff") {
      const value = args[++i];
      if (!value) usage(2);
      diffRef = value;
    } else if (arg === "--format") {
      const value = args[++i];
      if (value !== "json" && value !== "text") usage(2);
      format = value;
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
  if (!existsSync(target)) {
    process.stderr.write(`no such path: ${target}\n`);
    process.exit(2);
  }

  const result = scanProject({ target, diffRef });
  process.stdout.write(formatResult(result, format));
}

if (import.meta.main) {
  main();
}
