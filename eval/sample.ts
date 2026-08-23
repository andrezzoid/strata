/**
 * Draw the pre-registered precision sample for one detector, and render a blind
 * label sheet for it.
 *
 * Usage:
 *   bun eval/sample.ts duplicateSymbol
 *
 * Writes two files, both committed:
 *   labelling/samples/<detector>.json  — which findings were drawn, and how
 *   labelling/sheets/<detector>.md     — the source the labeller reads
 *
 * Selection is a seeded shuffle inside each repository stratum, so the sample is
 * reproducible from the committed results alone and cannot be redrawn to taste.
 * Rendering the sheet needs the corpus checked out; drawing the sample does not.
 *
 * The sheet carries source and locations only. strata's message, evidence and
 * fingerprint are withheld deliberately — the message asserts a cause, and a
 * labeller who has read it is no longer answering the question. See
 * labelling/PREREGISTRATION.md.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Finding } from "../src/types.ts";
import { CHECKOUT_DIR, loadResults, type TargetResult } from "./corpus.ts";

/** Fixed by the pre-registration. Changing it starts a new round, not a redraw. */
const SEED = "strata-precision-round-1";

/** Target sample size per detector; a smaller population is labelled in full. */
const TARGET_N: Record<string, number> = {
  duplicateSymbol: 60,
  wideSignature: 40,
  passThroughMethod: 40,
  passThroughExport: 40,
  uniqueImplementation: 40,
  forcedRareOption: 40,
  exposedMutableRepresentation: 40,
};

/** Source lines shown either side of a declaration in the sheet. */
const CONTEXT_LINES = 6;

/** Occurrences rendered per finding before the rest are listed as locations only. */
const MAX_RENDERED_OCCURRENCES = 4;

const LABELLING_DIR = join(new URL(".", import.meta.url).pathname, "labelling");

export type SampledFinding = {
  /** Stable across redraws: repo, target, detector and fingerprint identify the finding. */
  id: string;
  repo: string;
  target: string;
  commit: string;
  flag: string;
  file: string;
  line: number;
  fingerprint: string;
};

export type Sample = {
  detector: string;
  seed: string;
  population: number;
  drawn: number;
  /** Per-repository population and allocation, so the draw can be checked by hand. */
  strata: Array<{ repo: string; population: number; allocated: number }>;
  findings: SampledFinding[];
};

/**
 * mulberry32, seeded by FNV-1a over the seed string.
 *
 * Any small deterministic generator would do; what matters is that it is seeded
 * and lives in the repository, so a redraw produces the same sample on any
 * machine and a different sample cannot be passed off as the same one.
 */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drawn = Math.imul(state ^ (state >>> 15), 1 | state);
    drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn;
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

function findingId(result: TargetResult, finding: Finding): string {
  return `${result.repo}/${result.target}#${finding.fingerprint}`;
}

/**
 * Proportional allocation across repository strata, with a floor of one.
 *
 * Largest-remainder rather than plain rounding, so the allocations sum to the
 * target exactly instead of drifting a few either way.
 */
function allocate(
  populations: Map<string, number>,
  total: number,
  target: number,
): Map<string, number> {
  if (target >= total) return new Map([...populations].map(([repo, size]) => [repo, size]));

  const exact = [...populations].map(([repo, size]) => ({
    repo,
    size,
    ideal: Math.max(1, (size / total) * target),
  }));
  const allocation = new Map(
    exact.map(({ repo, size, ideal }) => [repo, Math.min(size, Math.floor(ideal))]),
  );

  let remaining = target - [...allocation.values()].reduce((sum, count) => sum + count, 0);
  const byRemainder = exact
    .map((entry) => ({ ...entry, remainder: entry.ideal - Math.floor(entry.ideal) }))
    .sort((one, other) => other.remainder - one.remainder || other.size - one.size);

  while (remaining > 0) {
    const next = byRemainder.find((entry) => allocation.get(entry.repo)! < entry.size);
    if (!next) break;
    allocation.set(next.repo, allocation.get(next.repo)! + 1);
    byRemainder.splice(byRemainder.indexOf(next), 1);
    byRemainder.push({ ...next, remainder: -1 });
    remaining -= 1;
  }
  return allocation;
}

export function draw(results: TargetResult[], detector: string): Sample {
  const population: Array<{ result: TargetResult; finding: Finding }> = [];
  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.flag === detector) population.push({ result, finding });
    }
  }

  const byRepo = new Map<string, typeof population>();
  for (const entry of population) {
    const bucket = byRepo.get(entry.result.repo) ?? [];
    bucket.push(entry);
    byRepo.set(entry.result.repo, bucket);
  }

  const sizes = new Map([...byRepo].map(([repo, entries]) => [repo, entries.length]));
  const target = Math.min(TARGET_N[detector] ?? 40, population.length);
  const allocation = allocate(sizes, population.length, target);

  const random = seededRandom(`${SEED}:${detector}`);
  const findings: SampledFinding[] = [];
  for (const repo of [...byRepo.keys()].sort()) {
    const entries = shuffled(byRepo.get(repo)!, random).slice(0, allocation.get(repo) ?? 0);
    for (const { result, finding } of entries) {
      findings.push({
        id: findingId(result, finding),
        repo: result.repo,
        target: result.target,
        commit: result.commit,
        flag: finding.flag,
        file: finding.file,
        line: finding.line,
        fingerprint: finding.fingerprint,
      });
    }
  }
  findings.sort((one, other) => one.id.localeCompare(other.id));

  return {
    detector,
    seed: `${SEED}:${detector}`,
    population: population.length,
    drawn: findings.length,
    strata: [...sizes]
      .map(([repo, size]) => ({ repo, population: size, allocated: allocation.get(repo) ?? 0 }))
      .sort((one, other) => one.repo.localeCompare(other.repo)),
    findings,
  };
}

/** Every location a finding covers: its anchor, plus any sibling occurrences it grouped. */
function locationsOf(finding: Finding): Array<{ file: string; line: number; name?: string }> {
  const occurrences = finding.metadata.occurrences;
  if (Array.isArray(occurrences) && occurrences.length > 0) {
    return occurrences as Array<{ file: string; line: number; name?: string }>;
  }
  return [{ file: finding.file, line: finding.line }];
}

async function renderSource(
  root: string,
  location: { file: string; line: number; name?: string },
): Promise<string> {
  const path = join(root, location.file);
  if (!existsSync(path))
    return `${location.file}:${location.line}\n(file not present in the checkout)`;

  const lines = (await Bun.file(path).text()).split("\n");
  const from = Math.max(0, location.line - 1 - CONTEXT_LINES);
  const to = Math.min(lines.length, location.line + CONTEXT_LINES);
  const width = String(to).length;
  const body = lines
    .slice(from, to)
    .map((text, offset) => {
      const number = from + offset + 1;
      const marker = number === location.line ? ">" : " ";
      return `${marker} ${String(number).padStart(width)} | ${text}`;
    })
    .join("\n");
  return `${location.file}:${location.line}${location.name ? `  (${location.name})` : ""}\n\`\`\`ts\n${body}\n\`\`\``;
}

async function renderSheet(sample: Sample, results: TargetResult[]): Promise<string> {
  const byId = new Map<string, { result: TargetResult; finding: Finding }>();
  for (const result of results) {
    for (const finding of result.findings)
      byId.set(findingId(result, finding), { result, finding });
  }

  const parts = [
    `# Label sheet — ${sample.detector}`,
    "",
    `${sample.drawn} of ${sample.population} findings, drawn with seed \`${sample.seed}\`.`,
    "",
    "For each item: **would changing this design make the code easier to understand or",
    "modify?** Answer `accept`, `reject`, or `depends`, and give a cause for every",
    "rejection. The permitted causes are fixed in `../PREREGISTRATION.md`.",
    "",
    "strata's message, evidence and fingerprint are withheld on purpose. Judge the source.",
    "",
  ];

  for (const [index, sampled] of sample.findings.entries()) {
    const entry = byId.get(sampled.id);
    parts.push("---", "", `## ${index + 1}. \`${sampled.id}\``, "");
    if (!entry) {
      parts.push("(finding not present in the committed results — record as `unrenderable`)", "");
      continue;
    }
    const root = join(CHECKOUT_DIR, sampled.repo, sampled.target);
    const locations = locationsOf(entry.finding);
    parts.push(`${locations.length} location(s) in \`${sampled.repo}/${sampled.target}\`.`, "");
    for (const location of locations.slice(0, MAX_RENDERED_OCCURRENCES)) {
      parts.push(await renderSource(root, location), "");
    }
    if (locations.length > MAX_RENDERED_OCCURRENCES) {
      const rest = locations
        .slice(MAX_RENDERED_OCCURRENCES)
        .map((location) => `${location.file}:${location.line}`)
        .join(", ");
      parts.push(`Further locations: ${rest}`, "");
    }
  }
  return parts.join("\n");
}

async function main(): Promise<number> {
  const detector = Bun.argv[2];
  if (!detector) {
    console.error("usage: bun eval/sample.ts <detector>");
    return 1;
  }

  const results = await loadResults();
  const sample = draw(results, detector);
  if (sample.population === 0) {
    console.error(`no findings for detector ${detector}`);
    return 1;
  }

  await Bun.write(
    join(LABELLING_DIR, "samples", `${detector}.json`),
    JSON.stringify(sample, null, 2) + "\n",
  );
  await Bun.write(
    join(LABELLING_DIR, "sheets", `${detector}.md`),
    await renderSheet(sample, results),
  );

  console.log(`${detector}: drew ${sample.drawn} of ${sample.population}`);
  for (const stratum of sample.strata) {
    console.log(
      `  ${stratum.repo.padEnd(22)} ${String(stratum.allocated).padStart(3)} of ${stratum.population}`,
    );
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
