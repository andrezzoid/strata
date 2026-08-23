/**
 * Materialise the pinned corpus and scan every target, writing one result file
 * per target under `eval/results/`.
 *
 * Usage:
 *   bun eval/run.ts              # every repo in the corpus
 *   bun eval/run.ts next zod     # only the named repo ids
 *
 * Timing is reported to the console but never written to a result file, so a
 * re-run with no detector change produces no diff.
 */

import { checkout, loadCorpus, measureSource, resultPath, type CorpusRepo } from "./corpus.ts";
import { join } from "node:path";

import { scanProject } from "../src/scan.ts";
import packageJson from "../package.json" with { type: "json" };

async function scanTarget(repo: CorpusRepo, checkoutDir: string, target: string): Promise<void> {
  const targetDir = join(checkoutDir, target);
  const started = Bun.nanoseconds();
  const result = await scanProject({ target: targetDir });
  const elapsedMs = Math.round((Bun.nanoseconds() - started) / 1e6);
  const { files, lines } = await measureSource(targetDir);

  await Bun.write(
    resultPath(repo.id, target),
    JSON.stringify(
      {
        repo: repo.id,
        commit: repo.commit,
        target,
        files,
        lines,
        strataVersion: packageJson.version,
        summary: result.summary,
        findings: result.findings,
      },
      null,
      2,
    ) + "\n",
  );

  const perKloc = lines === 0 ? 0 : (result.summary.totalFindings / lines) * 1000;
  console.log(
    `  ${target.padEnd(28)} ${String(files).padStart(5)} files  ${String(lines).padStart(7)} lines  ` +
      `${String(result.summary.totalFindings).padStart(4)} findings  ${perKloc.toFixed(1)}/KLOC  ${elapsedMs}ms`,
  );
}

async function main(): Promise<number> {
  const corpus = await loadCorpus();
  const requested = new Set(Bun.argv.slice(2));
  const repos =
    requested.size === 0 ? corpus.repos : corpus.repos.filter((repo) => requested.has(repo.id));

  const unknown = [...requested].filter((id) => !corpus.repos.some((repo) => repo.id === id));
  if (unknown.length > 0) {
    console.error(`unknown repo id(s): ${unknown.join(", ")}`);
    return 1;
  }

  for (const repo of repos) {
    console.log(
      `\n${repo.id} @ ${repo.commit.slice(0, 8)}  (${(repo.aiAttributed.share * 100).toFixed(1)}% agent-attributed)`,
    );
    const dir = checkout(repo);
    for (const target of repo.targets) await scanTarget(repo, dir, target);
  }

  console.log(`\nWrote results for ${repos.length} repo(s). Summarise with: bun run eval:report`);
  return 0;
}

process.exit(await main());
