/**
 * Summarise the committed corpus results.
 *
 * Usage: bun eval/report.ts
 *
 * The report answers the questions the fixture suite cannot: how much does each
 * detector actually fire on code nobody wrote for us, which detectors carry the
 * output, and which barely appear at all. Nothing here judges whether a finding
 * is correct — that is the labelling step, and it needs a human.
 */

import { DETECTOR_IDS } from "../src/detectors/registry.ts";
import { loadCorpus, loadResults, type Corpus, type TargetResult } from "./corpus.ts";

const RULE = "─".repeat(96);

function perKloc(count: number, lines: number): number {
  return lines === 0 ? 0 : (count / lines) * 1000;
}

function attributionOf(corpus: Corpus, repoId: string): number {
  return corpus.repos.find((repo) => repo.id === repoId)?.aiAttributed.share ?? 0;
}

function byTarget(results: TargetResult[], corpus: Corpus): void {
  console.log("Per target\n" + RULE);
  console.log(
    `${"repo/target".padEnd(46)}${"agent%".padStart(7)}${"lines".padStart(9)}${"find".padStart(6)}` +
      `${"/KLOC".padStart(7)}${"det".padStart(5)}`,
  );
  for (const result of results) {
    const label = `${result.repo}/${result.target}`;
    console.log(
      label.slice(0, 45).padEnd(46) +
        (attributionOf(corpus, result.repo) * 100).toFixed(1).padStart(7) +
        String(result.lines).padStart(9) +
        String(result.summary.totalFindings).padStart(6) +
        perKloc(result.summary.totalFindings, result.lines).toFixed(1).padStart(7) +
        String(Object.keys(result.summary.byFlag).length).padStart(5),
    );
  }
}

function byDetector(results: TargetResult[]): void {
  const totalLines = results.reduce((sum, result) => sum + result.lines, 0);
  const totalFindings = results.reduce((sum, result) => sum + result.summary.totalFindings, 0);

  console.log("\n\nPer detector\n" + RULE);
  console.log(
    `${"detector".padEnd(34)}${"find".padStart(6)}${"share".padStart(8)}${"/KLOC".padStart(8)}` +
      `${"targets".padStart(9)}  top target`,
  );

  const rows = DETECTOR_IDS.map((id) => {
    const hits = results
      .map((result) => ({ result, count: result.summary.byFlag[id] ?? 0 }))
      .filter((hit) => hit.count > 0)
      .sort((one, other) => other.count - one.count);
    const count = hits.reduce((sum, hit) => sum + hit.count, 0);
    return { id, count, targets: hits.length, top: hits[0] };
  }).sort((one, other) => other.count - one.count);

  for (const row of rows) {
    const share = totalFindings === 0 ? 0 : (row.count / totalFindings) * 100;
    const top = row.top
      ? `${row.top.result.repo}/${row.top.result.target} (${row.top.count})`
      : "—";
    console.log(
      row.id.padEnd(34) +
        String(row.count).padStart(6) +
        `${share.toFixed(1)}%`.padStart(8) +
        perKloc(row.count, totalLines).toFixed(2).padStart(8) +
        `${row.targets}/${results.length}`.padStart(9) +
        `  ${top}`,
    );
  }

  const silent = rows.filter((row) => row.count === 0).map((row) => row.id);
  const rare = rows.filter((row) => row.count > 0 && row.count < 5).map((row) => row.id);
  if (silent.length > 0) console.log(`\n  never fires:  ${silent.join(", ")}`);
  if (rare.length > 0) console.log(`  fires <5×:    ${rare.join(", ")}`);
}

function byAttribution(results: TargetResult[], corpus: Corpus): void {
  console.log("\n\nBy agent-attribution band\n" + RULE);
  const bands = [
    { label: "high  (>20%)", min: 0.2 },
    { label: "mid   (5-20%)", min: 0.05 },
    { label: "low   (<5%)", min: 0 },
  ];
  for (const [index, band] of bands.entries()) {
    const max = index === 0 ? Infinity : bands[index - 1]!.min;
    const inBand = results.filter((result) => {
      const share = attributionOf(corpus, result.repo);
      return share >= band.min && share < max;
    });
    if (inBand.length === 0) continue;
    const lines = inBand.reduce((sum, result) => sum + result.lines, 0);
    const findings = inBand.reduce((sum, result) => sum + result.summary.totalFindings, 0);
    console.log(
      band.label.padEnd(16) +
        `${inBand.length} targets`.padStart(11) +
        String(lines).padStart(9) +
        ` lines  ${String(findings).padStart(4)} findings  ` +
        `${perKloc(findings, lines).toFixed(2)}/KLOC`,
    );
  }
  console.log(
    "\n  Read this as description, not as effect: the bands differ in domain, age and\n" +
      "  house style as much as in agent share, and attribution is per-commit and\n" +
      "  self-declared. It is a slice to inspect, not a comparison to draw from.",
  );
}

async function main(): Promise<number> {
  const [corpus, results] = await Promise.all([loadCorpus(), loadResults()]);
  if (results.length === 0) {
    console.error("no results under eval/results — run `bun run eval:run` first");
    return 1;
  }

  const totalLines = results.reduce((sum, result) => sum + result.lines, 0);
  const totalFindings = results.reduce((sum, result) => sum + result.summary.totalFindings, 0);
  console.log(
    `strata corpus report — ${results.length} targets, ${results.reduce((sum, r) => sum + r.files, 0)} files, ` +
      `${totalLines} lines, ${totalFindings} findings (${perKloc(totalFindings, totalLines).toFixed(2)}/KLOC)\n`,
  );

  byTarget(results, corpus);
  byDetector(results);
  byAttribution(results, corpus);
  return 0;
}

process.exit(await main());
