const COVERAGE_DIR = "coverage";
const COVERAGE_FILE = `${COVERAGE_DIR}/lcov.info`;
const MIN_LINE_COVERAGE_PERCENT = 85;

export interface CoverageSummary {
  /** Executable source lines reported by LCOV. */
  linesFound: number;
  /** Executable source lines hit by at least one test. */
  linesHit: number;
  /** Aggregate line coverage percentage across all LCOV records. */
  linePercent: number;
}

/**
 * Aggregates LCOV line counters for product source records under `src/`.
 *
 * An empty report is treated as 0% coverage, which lets the threshold check fail
 * normally instead of adding a separate malformed-report error path.
 */
export function summarizeLcov(lcov: string): CoverageSummary {
  let linesFound = 0;
  let linesHit = 0;
  let inSourceRecord = false;

  for (const line of lcov.split("\n")) {
    if (line.startsWith("SF:")) {
      const file = line.slice(3).replaceAll("\\", "/");
      inSourceRecord = file.startsWith("src/") || file.includes("/src/");
      continue;
    }
    if (!inSourceRecord) continue;
    if (line.startsWith("LF:")) linesFound += Number(line.slice(3));
    if (line.startsWith("LH:")) linesHit += Number(line.slice(3));
  }

  return {
    linesFound,
    linesHit,
    linePercent: linesFound === 0 ? 0 : (linesHit / linesFound) * 100,
  };
}

/** True when aggregate line coverage reaches the configured minimum percentage. */
export function meetsLineCoverageThreshold(
  summary: CoverageSummary,
  minPercent = MIN_LINE_COVERAGE_PERCENT,
): boolean {
  return summary.linePercent >= minPercent;
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(2)}%`;
}

async function runCoverageGate(): Promise<number> {
  const result = Bun.spawnSync(
    ["bun", "test", "--coverage", "--coverage-reporter=lcov", "--coverage-dir", COVERAGE_DIR],
    { stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  if (!result.success) return result.exitCode;

  const summary = summarizeLcov(await Bun.file(COVERAGE_FILE).text());
  if (!meetsLineCoverageThreshold(summary)) {
    process.stderr.write(
      `Coverage ${formatPercent(summary.linePercent)} is below ${MIN_LINE_COVERAGE_PERCENT}% line threshold\n`,
    );
    return 1;
  }

  process.stdout.write(
    `Coverage ${formatPercent(summary.linePercent)} meets ${MIN_LINE_COVERAGE_PERCENT}% line threshold\n`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(await runCoverageGate());
}
