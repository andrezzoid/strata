/**
 * Report precision and the rejection-cause histogram for a labelled detector.
 *
 * Usage: bun eval/label-report.ts duplicateSymbol
 *
 * The statistics are the ones fixed in labelling/PREREGISTRATION.md and nothing
 * else: precision over accept+reject, a conservative precision that counts every
 * `depends` against the detector, and the cause histogram. The histogram is the
 * point — a precision number ranks detectors, the causes say what to fix.
 */

import { join } from "node:path";

import type { Sample } from "./sample.ts";

const LABELLING_DIR = join(new URL(".", import.meta.url).pathname, "labelling");

type Verdict = "accept" | "reject" | "depends" | "unrenderable";

type Label = { id: string; verdict: Verdict; cause: string | null; note?: string };

/**
 * Wilson score interval.
 *
 * The normal approximation is badly behaved at the sample sizes and proportions
 * this round produces — it can put a bound outside [0, 1] — so the interval is
 * Wilson's, which cannot.
 */
function wilson(successes: number, trials: number): { low: number; high: number } {
  if (trials === 0) return { low: 0, high: 0 };
  const z = 1.959963984540054;
  const proportion = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = proportion + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * trials)) / trials);
  return { low: (centre - spread) / denominator, high: (centre + spread) / denominator };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function bar(count: number, of: number): string {
  return "█".repeat(Math.round((count / Math.max(of, 1)) * 30));
}

async function main(): Promise<number> {
  const detector = Bun.argv[2];
  if (!detector) {
    console.error("usage: bun eval/label-report.ts <detector>");
    return 1;
  }

  const sample = (await Bun.file(
    join(LABELLING_DIR, "samples", `${detector}.json`),
  ).json()) as Sample;
  const labelText = await Bun.file(join(LABELLING_DIR, "labels", `${detector}.jsonl`)).text();
  const labels: Label[] = labelText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Label);

  const missing = sample.findings.filter(
    (finding) => !labels.some((label) => label.id === finding.id),
  );
  if (missing.length > 0) {
    console.error(`${missing.length} sampled finding(s) unlabelled — the round is not complete`);
    return 1;
  }

  const counts = { accept: 0, reject: 0, depends: 0, unrenderable: 0 };
  for (const label of labels) counts[label.verdict] += 1;

  const judged = counts.accept + counts.reject;
  const precision = judged === 0 ? 0 : counts.accept / judged;
  const interval = wilson(counts.accept, judged);
  const conservativeDenominator = judged + counts.depends;
  const conservative = conservativeDenominator === 0 ? 0 : counts.accept / conservativeDenominator;

  console.log(`${detector} — precision, round 1`);
  console.log("─".repeat(72));
  console.log(`population        ${sample.population}`);
  console.log(`labelled          ${labels.length}`);
  console.log(
    `verdicts          ${counts.accept} accept · ${counts.reject} reject · ${counts.depends} depends` +
      (counts.unrenderable > 0 ? ` · ${counts.unrenderable} unrenderable` : ""),
  );
  console.log("");
  console.log(
    `precision         ${percent(precision)}   95% CI [${percent(interval.low)}, ${percent(interval.high)}]   n=${judged}`,
  );
  console.log(`conservative      ${percent(conservative)}   (every 'depends' counted against)`);

  const causes = new Map<string, number>();
  for (const label of labels) {
    if (label.verdict !== "reject") continue;
    const cause = label.cause ?? "unrecorded";
    causes.set(cause, (causes.get(cause) ?? 0) + 1);
  }

  console.log(`\n\nWhy the ${counts.reject} rejections were rejected`);
  console.log("─".repeat(72));
  const width = Math.max(...[...causes.keys()].map((cause) => cause.length));
  for (const [cause, count] of [...causes].sort((one, other) => other[1] - one[1])) {
    console.log(
      `${cause.padEnd(width)}  ${String(count).padStart(3)}  ${percent(count / counts.reject).padStart(6)}  ${bar(count, counts.reject)}`,
    );
  }

  const byRepo = new Map<string, { accept: number; total: number }>();
  for (const label of labels) {
    if (label.verdict !== "accept" && label.verdict !== "reject") continue;
    const repo = sample.findings.find((finding) => finding.id === label.id)!.repo;
    const entry = byRepo.get(repo) ?? { accept: 0, total: 0 };
    entry.total += 1;
    if (label.verdict === "accept") entry.accept += 1;
    byRepo.set(repo, entry);
  }

  console.log("\n\nBy repository (small n each — orientation only, not a ranking)");
  console.log("─".repeat(72));
  for (const [repo, entry] of [...byRepo].sort((one, other) => one[0].localeCompare(other[0]))) {
    console.log(
      `${repo.padEnd(22)} ${String(entry.accept).padStart(2)}/${String(entry.total).padEnd(3)} ${percent(entry.accept / entry.total).padStart(7)}`,
    );
  }

  console.log(
    "\n\nRound 1 is labelled by the same agent that wrote the detector. Provisional\n" +
      "until a human blind-labels a subset and the agreement rate is published —\n" +
      "see labelling/PREREGISTRATION.md.",
  );
  return 0;
}

process.exit(await main());
