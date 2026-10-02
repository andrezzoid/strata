// Draws the stratified, seeded 2026-10-02 sample of strata v0.3.0/v0.4.0 findings and writes blind labeling batches.
// Reference script: run both strata versions with `--format json` on the corpus SHAs in design.json first.
//   STRATA_EVAL_WORK    dir holding v0.3.0/<repo>.json and v0.4.0/<repo>.json; batches are written here
//   STRATA_EVAL_CORPUS  dir holding one checkout per repo, named as in design.json
//   STRATA_EVAL_OLD     strata v0.3.0 checkout (for docs of detectors removed in 0.4.0)
import { mkdirSync } from "node:fs";

const WORK = process.env.STRATA_EVAL_WORK ?? "eval-work";
const CORPUS = process.env.STRATA_EVAL_CORPUS ?? `${WORK}/corpus`;
const OLD = process.env.STRATA_EVAL_OLD ?? `${WORK}/strata-0.3.0`;
const DOCS = `${import.meta.dir}/../../../docs/detectors`;
const REPOS = ["hono", "excalidraw", "trpc", "twenty"];
const PER_CELL = 10;
const BATCHES = 10;
const DOUBLE_LABEL_SHARE = 0.15;

type F = {
  flag: string;
  file: string;
  line: number;
  message: string;
  metadata: any;
  fingerprint: string;
};

let seed = 20261002;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const key = (f: F) => `${f.flag}|${f.file}|${f.line}`;

// stratum id -> repo -> findings
const strata = new Map<string, Map<string, F[]>>();
// version -> detector -> list of strata ids that make up that version's population
const composition: Record<string, Record<string, string[]>> = { "v0.3.0": {}, "v0.4.0": {} };

function add(stratum: string, repo: string, f: F) {
  if (!strata.has(stratum)) strata.set(stratum, new Map());
  const m = strata.get(stratum)!;
  if (!m.has(repo)) m.set(repo, []);
  m.get(repo)!.push(f);
}
function compose(version: string, flag: string, stratum: string) {
  const list = (composition[version][flag] ??= []);
  if (!list.includes(stratum)) list.push(stratum);
}

for (const repo of REPOS) {
  const v3: F[] = (await Bun.file(`${WORK}/v0.3.0/${repo}.json`).json()).findings;
  const v4: F[] = (await Bun.file(`${WORK}/v0.4.0/${repo}.json`).json()).findings;
  const k3 = new Set(v3.map(key));
  const k4 = new Set(v4.map(key));
  const flags = new Set([...v3, ...v4].map((f) => f.flag));
  for (const flag of flags) {
    const in3 = v3.some((f) => f.flag === flag) || isV3Flag(flag);
    const in4 = isV4Flag(flag);
    for (const f of v3.filter((f) => f.flag === flag)) {
      const stratum = in4
        ? k4.has(key(f))
          ? `${flag}:shared`
          : `${flag}:only-v0.3.0`
        : `${flag}:only-v0.3.0`;
      add(stratum, repo, f);
      compose("v0.3.0", flag, stratum);
      if (stratum.endsWith(":shared")) compose("v0.4.0", flag, stratum);
    }
    for (const f of v4.filter((f) => f.flag === flag)) {
      if (k3.has(key(f)) && in3) continue;
      const stratum = `${flag}:only-v0.4.0`;
      add(stratum, repo, f);
      compose("v0.4.0", flag, stratum);
    }
  }
}
function isV3Flag(flag: string) {
  return [
    "shallowModule",
    "passThroughMethod",
    "passThroughVariable",
    "emptyCatch",
    "catchRethrow",
    "genericNaming",
    "tsEscapeHatch",
    "wideModule",
    "wideSignature",
    "duplicateSymbol",
    "uniqueImplementation",
    "orphanFile",
  ].includes(flag);
}
function isV4Flag(flag: string) {
  return [
    "passThroughMethod",
    "passThroughExport",
    "exposedMutableRepresentation",
    "wideSignature",
    "forcedRareOption",
    "duplicateSymbol",
    "uniqueImplementation",
  ].includes(flag);
}

// ---- context extraction ----
const fileCache = new Map<string, string[]>();
async function lines(repo: string, file: string): Promise<string[]> {
  const k = `${repo}/${file}`;
  if (!fileCache.has(k)) {
    const f = Bun.file(`${CORPUS}/${repo}/${file}`);
    fileCache.set(k, (await f.exists()) ? (await f.text()).split("\n") : []);
  }
  return fileCache.get(k)!;
}
async function snippet(
  repo: string,
  file: string,
  line: number,
  before: number,
  after: number,
): Promise<string> {
  const ls = await lines(repo, file);
  const start = Math.max(1, line - before);
  const end = Math.min(ls.length, line + after);
  const out = [`--- ${file}:${start}-${end}`];
  for (let i = start; i <= end; i++) out.push(`${String(i).padStart(5)}| ${ls[i - 1]}`);
  return out.join("\n");
}
async function context(repo: string, f: F): Promise<string> {
  const m = f.metadata ?? {};
  switch (f.flag) {
    case "duplicateSymbol": {
      const occ = (m.occurrences ?? []) as Array<{ file: string; line: number; name: string }>;
      const parts = [
        `${occ.length} occurrences: ${occ
          .slice(0, 12)
          .map((o) => `${o.file}:${o.line} ${o.name}`)
          .join("; ")}${occ.length > 12 ? " ..." : ""}`,
      ];
      for (const o of occ.slice(0, 3)) parts.push(await snippet(repo, o.file, o.line, 1, 14));
      return parts.join("\n");
    }
    case "uniqueImplementation": {
      const parts = [await snippet(repo, f.file, f.line, 3, 18)];
      for (const i of (m.implementers ?? []).slice(0, 1))
        parts.push(await snippet(repo, i.file, i.line, 2, 14));
      return parts.join("\n");
    }
    case "forcedRareOption": {
      const parts = [await snippet(repo, f.file, f.line, 3, 15)];
      for (const c of (m.callSites ?? []).slice(0, 3))
        parts.push(await snippet(repo, c.file, c.line, 2, 2));
      if (m.declaration)
        parts.push(await snippet(repo, m.declaration.file, m.declaration.line, 2, 10));
      return parts.join("\n");
    }
    case "orphanFile":
    case "shallowModule":
    case "wideModule":
      return snippet(repo, f.file, 1, 0, 45);
    case "tsEscapeHatch":
    case "emptyCatch":
      return snippet(repo, f.file, f.line, 8, 8);
    default:
      return snippet(repo, f.file, f.line, 8, 22);
  }
}

// ---- sample ----
type Item = {
  id: string;
  stratum: string;
  repo: string;
  flag: string;
  file: string;
  line: number;
  message: string;
  metadata: any;
  context: string;
};
const items: Item[] = [];
const populations: Record<string, Record<string, number>> = {};
for (const [stratum, byRepo] of strata) {
  populations[stratum] = {};
  for (const [repo, fs] of byRepo) {
    populations[stratum][repo] = fs.length;
    for (const f of shuffle(fs).slice(0, PER_CELL)) {
      const md = JSON.stringify(f.metadata ?? {});
      items.push({
        id: Math.floor(rand() * 0xffffffff)
          .toString(16)
          .padStart(8, "0"),
        stratum,
        repo,
        flag: f.flag,
        file: f.file,
        line: f.line,
        message: f.message,
        metadata:
          md.length > 1500
            ? JSON.parse(JSON.stringify({ truncated: md.slice(0, 1500) }))
            : f.metadata,
        context: await context(repo, f),
      });
    }
  }
}

// ---- rubrics (What / Why / When acceptable only; version-neutral) ----
async function rubric(flag: string): Promise<string> {
  const kebab = flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const dir of [DOCS, `${OLD}/docs/detectors`]) {
    const f = Bun.file(`${dir}/${kebab}.md`);
    if (!(await f.exists())) continue;
    const text = await f.text();
    const sections = text.split(/^## /m);
    const keep = sections.filter((s) => /^(What|Why|When a finding may be acceptable)/.test(s));
    return (
      `### Detector \`${flag}\`\n\n` +
      keep.map((s) => `#### ${s.replace(/\n---[\s\S]*$/, "").trim()}`).join("\n\n")
    );
  }
  return `### Detector \`${flag}\`\n\n(no docs)`;
}

mkdirSync(`${WORK}/batches`, { recursive: true });
mkdirSync(`${WORK}/batches2`, { recursive: true });
mkdirSync(`${WORK}/labels`, { recursive: true });
mkdirSync(`${WORK}/labels2`, { recursive: true });
const shuffled = shuffle(items);
await Bun.write(`${WORK}/items.json`, JSON.stringify(shuffled, null, 2));
await Bun.write(
  `${WORK}/design.json`,
  JSON.stringify({ populations, composition, perCell: PER_CELL }, null, 2),
);

async function writeBatch(dir: string, name: string, batch: Item[]) {
  const flags = [...new Set(batch.map((i) => i.flag))].sort();
  const rubrics = await Promise.all(flags.map(rubric));
  const body = batch
    .map((i) =>
      [
        `## Item ${i.id}`,
        `- detector: \`${i.flag}\``,
        `- repo: ${i.repo} (checkout at ${CORPUS}/${i.repo})`,
        `- location: ${i.file}:${i.line}`,
        `- message: ${i.message}`,
        `- metadata: \`${JSON.stringify(i.metadata).slice(0, 1200)}\``,
        "",
        "```",
        i.context,
        "```",
      ].join("\n"),
    )
    .join("\n\n");
  await Bun.write(
    `${dir}/${name}.md`,
    `# Rubrics\n\n${rubrics.join("\n\n")}\n\n# Items (${batch.length})\n\n${body}\n`,
  );
}
const size = Math.ceil(shuffled.length / BATCHES);
for (let b = 0; b < BATCHES; b++)
  await writeBatch(
    `${WORK}/batches`,
    `batch-${String(b + 1).padStart(2, "0")}`,
    shuffled.slice(b * size, (b + 1) * size),
  );
const dbl = shuffle(shuffled).slice(0, Math.round(shuffled.length * DOUBLE_LABEL_SHARE));
const half = Math.ceil(dbl.length / 2);
await writeBatch(`${WORK}/batches2`, "batch-A", dbl.slice(0, half));
await writeBatch(`${WORK}/batches2`, "batch-B", dbl.slice(half));

console.log("items", items.length, "double-labeled", dbl.length, "batch size", size);
for (const [s, p] of Object.entries(populations)) console.log(s.padEnd(44), JSON.stringify(p));
console.log(JSON.stringify(composition));
