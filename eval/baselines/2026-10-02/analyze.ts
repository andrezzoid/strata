// Recomputes the 2026-10-02 baseline: strict/lenient precision per detector and per report from blind labels.
// Run: bun eval/baselines/2026-10-02/analyze.ts

const SP = import.meta.dir;
const REPOS = ["hono", "excalidraw", "trpc", "twenty"];
type Label = {
  id: string;
  label: "actionable" | "defensible" | "wrong";
  reason: string;
  confidence: string;
  note: string;
};
type Item = {
  id: string;
  stratum: string;
  repo: string;
  flag: string;
  file: string;
  line: number;
  message: string;
};

const items: Item[] = await Bun.file(`${SP}/items.json`).json();
const design = await Bun.file(`${SP}/design.json`).json();
const populations: Record<string, Record<string, number>> = design.populations;
const composition: Record<string, Record<string, string[]>> = design.composition;

async function loadLabels(file: string): Promise<Map<string, Label>> {
  const list = (await Bun.file(`${SP}/${file}`).json()) as Label[];
  return new Map(list.map((l) => [l.id, l]));
}
const labels = await loadLabels("labels.json");
const labels2 = await loadLabels("labels-second.json");
const missing = items.filter((i) => !labels.has(i.id));
console.log(
  `labels: ${labels.size}/${items.length}; missing ${missing.length}; second-labeler ${labels2.size}`,
);

const pct = (x: number) => (Number.isNaN(x) ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`);
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN];
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// per stratum x repo sample stats
type Cell = { n: number; act: number; def: number; wrong: number; reasons: Record<string, number> };
const cells = new Map<string, Cell>();
for (const i of items) {
  const l = labels.get(i.id);
  if (!l) continue;
  const k = `${i.stratum}|${i.repo}`;
  const c = cells.get(k) ?? { n: 0, act: 0, def: 0, wrong: 0, reasons: {} };
  c.n++;
  if (l.label === "actionable") c.act++;
  else if (l.label === "defensible") c.def++;
  else c.wrong++;
  if (l.reason) c.reasons[l.reason] = (c.reasons[l.reason] ?? 0) + 1;
  cells.set(k, c);
}

// version x detector x repo weighted estimate
function estimate(version: string, flag: string, repo: string) {
  let N = 0,
    strict = 0,
    lenient = 0;
  for (const s of composition[version][flag] ?? []) {
    const n = populations[s]?.[repo] ?? 0;
    if (!n) continue;
    const c = cells.get(`${s}|${repo}`);
    if (!c) throw new Error(`no sample for ${s}|${repo}`);
    N += n;
    strict += (n * c.act) / c.n;
    lenient += (n * (c.act + c.def)) / c.n;
  }
  return { N, strict, lenient };
}

for (const version of ["v0.3.0", "v0.4.0"]) {
  console.log(
    `\n=== ${version}: per detector (sample is repo-balanced, up to 10 per repo per stratum)`,
  );
  console.log(
    "detector".padEnd(30),
    "findings",
    "  n",
    "strict  [95% CI]   ",
    "lenient",
    " wrong: mech / nonRev",
    " volume-weighted strict / lenient",
  );
  let reportN = 0,
    reportStrict = 0,
    reportLenient = 0;
  for (const flag of Object.keys(composition[version]).sort()) {
    let n = 0,
      act = 0,
      def = 0,
      mech = 0,
      nonrev = 0;
    for (const s of composition[version][flag])
      for (const repo of REPOS) {
        const c = cells.get(`${s}|${repo}`);
        if (!c) continue;
        n += c.n;
        act += c.act;
        def += c.def;
        mech += c.reasons.mechanical ?? 0;
        nonrev += c.reasons.nonReviewable ?? 0;
      }
    let N = 0,
      S = 0,
      L = 0;
    for (const repo of REPOS) {
      const e = estimate(version, flag, repo);
      N += e.N;
      S += e.strict;
      L += e.lenient;
    }
    reportN += N;
    reportStrict += S;
    reportLenient += L;
    const [lo, hi] = wilson(act, n);
    console.log(
      flag.padEnd(30),
      String(N).padStart(8),
      String(n).padStart(3),
      pct(act / n),
      `[${pct(lo)}-${pct(hi)}]`,
      pct((act + def) / n),
      "   ",
      String(mech).padStart(4),
      "/",
      String(nonrev).padStart(3),
      "       ",
      pct(S / N),
      "/",
      pct(L / N),
    );
  }
  console.log(
    `ALL (volume-weighted across 4 repos): findings ${reportN}, strict ${pct(reportStrict / reportN)}, lenient ${pct(reportLenient / reportN)}`,
  );
  console.log(`--- ${version}: per report (volume-weighted share of a repo's findings)`);
  for (const repo of REPOS) {
    let N = 0,
      S = 0,
      L = 0;
    for (const flag of Object.keys(composition[version])) {
      const e = estimate(version, flag, repo);
      N += e.N;
      S += e.strict;
      L += e.lenient;
    }
    console.log(
      repo.padEnd(11),
      "findings",
      String(N).padStart(6),
      " est. actionable",
      String(Math.round(S)).padStart(5),
      `(${pct(S / N)})`,
      " est. not wrong",
      String(Math.round(L)).padStart(5),
      `(${pct(L / N)})`,
    );
  }
}

console.log("\n=== strata detail (stratum | repo: n act/def/wrong)");
for (const [k, c] of [...cells.entries()].sort())
  console.log(k.padEnd(52), `n=${c.n}`, `${c.act}/${c.def}/${c.wrong}`, JSON.stringify(c.reasons));

// inter-labeler agreement
const pairs = [...labels2.entries()]
  .filter(([id]) => labels.has(id))
  .map(([id, b]) => [labels.get(id)!.label, b.label] as const);
function kappa(ps: ReadonlyArray<readonly [string, string]>) {
  const cats = [...new Set(ps.flat())];
  const po = ps.filter(([a, b]) => a === b).length / ps.length;
  let pe = 0;
  for (const c of cats)
    pe +=
      (ps.filter(([a]) => a === c).length / ps.length) *
      (ps.filter(([, b]) => b === c).length / ps.length);
  return { agree: po, kappa: (po - pe) / (1 - pe) };
}
if (pairs.length) {
  const three = kappa(pairs);
  const strict = kappa(
    pairs.map(
      ([a, b]) => [a === "actionable" ? "y" : "n", b === "actionable" ? "y" : "n"] as const,
    ),
  );
  const len = kappa(
    pairs.map(([a, b]) => [a === "wrong" ? "n" : "y", b === "wrong" ? "n" : "y"] as const),
  );
  console.log(`\n=== agreement on ${pairs.length} double-labeled items`);
  console.log(`3-way: ${pct(three.agree)} agree, kappa ${three.kappa.toFixed(2)}`);
  console.log(`actionable vs not: ${pct(strict.agree)} agree, kappa ${strict.kappa.toFixed(2)}`);
  console.log(`wrong vs not: ${pct(len.agree)} agree, kappa ${len.kappa.toFixed(2)}`);
  const byItem = new Map(items.map((i) => [i.id, i]));
  for (const [id, b] of labels2) {
    const a = labels.get(id);
    if (a && a.label !== b.label)
      console.log(`  disagree ${id} ${byItem.get(id)?.flag}: ${a.label} vs ${b.label}`);
  }
}
