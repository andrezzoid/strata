/**
 * The evaluation corpus: what it is, how to materialise it, and where results live.
 *
 * The corpus exists to answer questions the fixture suite cannot. A fixture
 * proves a detector fires on code written to make it fire; the corpus measures
 * what the detector does to code nobody wrote for us. It is also the only place
 * a threshold change becomes observable: adjust a constant, re-run, diff the
 * committed results.
 *
 * Repositories are pinned to an exact commit and fetched shallow with blobs
 * filtered, so materialising the whole corpus costs a few hundred megabytes and
 * about a minute rather than several gigabytes.
 */

import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ScanResult } from "../src/types.ts";

/** One pinned repository and the source roots worth scanning inside it. */
export type CorpusRepo = {
  id: string;
  url: string;
  commit: string;
  committedAt: string;
  /**
   * Share of the 400 commits before `commit` that declare a coding agent as
   * author or co-author. A lower bound on AI involvement — see `corpus.json`.
   */
  aiAttributed: { matched: number; sample: number; share: number; agents: string[] };
  why: string;
  targets: string[];
};

export type Corpus = {
  schemaVersion: number;
  description: string;
  aiAttribution: { method: string; pattern: string; caveat: string };
  repos: CorpusRepo[];
};

/**
 * One scanned target, as committed under `eval/results/`.
 *
 * Deliberately carries no timing and no timestamp: a result file must change
 * only when strata's answer changes, or it is worthless as a baseline to diff.
 */
export type TargetResult = {
  repo: string;
  commit: string;
  target: string;
  /** Source files the scan parsed. */
  files: number;
  /** Physical lines across those files, for per-KLOC rates. */
  lines: number;
  /** The `strata` version that produced this result. */
  strataVersion: string;
  summary: ScanResult["summary"];
  findings: ScanResult["findings"];
};

const EVAL_DIR = new URL(".", import.meta.url).pathname;

/** Working checkouts. Gitignored: reproducible from `corpus.json` at any time. */
export const CHECKOUT_DIR = join(EVAL_DIR, ".corpus");

/** Committed scan results, one file per repo target. */
export const RESULTS_DIR = join(EVAL_DIR, "results");

export async function loadCorpus(): Promise<Corpus> {
  return (await Bun.file(join(EVAL_DIR, "corpus.json")).json()) as Corpus;
}

/** Filesystem-safe identity for a repo target, used as both result filename and report label. */
export function targetSlug(repoId: string, target: string): string {
  return `${repoId}__${target.replace(/[/\\]/g, "-")}`;
}

export function resultPath(repoId: string, target: string): string {
  return join(RESULTS_DIR, `${targetSlug(repoId, target)}.json`);
}

export async function loadResults(): Promise<TargetResult[]> {
  const glob = new Bun.Glob("*.json");
  const paths = [...glob.scanSync({ cwd: RESULTS_DIR, absolute: true })].sort();
  return Promise.all(paths.map((path) => Bun.file(path).json() as Promise<TargetResult>));
}

/**
 * Runs git in `cwd`, fenced so it can only ever answer about `cwd` itself.
 *
 * `GIT_CEILING_DIRECTORIES` stops git's upward walk at the parent, because a
 * checkout directory lives INSIDE this repository and an unfenced command run
 * in an empty one resolves to strata and acts on it. A missing directory is
 * reported as a failed command rather than ENOENT against the binary, which
 * reads as "git is not installed" and sends the reader looking in the wrong
 * place.
 */
function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  if (!existsSync(cwd)) return { ok: false, stdout: "", stderr: `no such directory: ${cwd}` };
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(cwd) },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: result.exitCode === 0,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

/**
 * Refuses unless `dir` is itself the root of a git repository.
 *
 * The second half of the fence, and the one that must never be removed: the
 * ceiling stops the walk, this proves it stopped in the right place. Without
 * it, `git remote remove origin` in a checkout directory deletes *strata's*
 * remote and every remote-tracking ref with it. That is not hypothetical — it
 * is why both halves exist.
 */
export function assertOwnRepository(dir: string): void {
  const toplevel = git(["rev-parse", "--show-toplevel"], dir);
  if (toplevel.ok && realpathSync(toplevel.stdout) === realpathSync(dir)) return;
  throw new Error(
    `refusing to run git in ${dir}: it resolves to ` +
      `${toplevel.ok ? toplevel.stdout : "no repository"}, not itself`,
  );
}

/**
 * Materialises one repo at its pinned commit, and returns the checkout path.
 *
 * Fetching the commit by SHA rather than cloning a branch is what makes the
 * corpus reproducible: a branch moves, and a corpus that silently re-pins itself
 * cannot tell a detector change from an upstream change. Already-correct
 * checkouts are left alone, so re-running the corpus is cheap.
 */
export function checkout(repo: CorpusRepo): string {
  const dir = join(CHECKOUT_DIR, repo.id);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".git"))) git(["init", "-q"], dir);
  assertOwnRepository(dir);

  if (git(["rev-parse", "HEAD"], dir).stdout === repo.commit) return dir;

  git(["remote", "remove", "origin"], dir);
  git(["remote", "add", "origin", repo.url], dir);

  const fetched = git(
    ["fetch", "--depth", "1", "--filter=blob:none", "-q", "origin", repo.commit],
    dir,
  );
  if (!fetched.ok) {
    throw new Error(`fetch ${repo.id}@${repo.commit.slice(0, 8)} failed: ${fetched.stderr}`);
  }
  const checkedOut = git(["checkout", "-q", "--detach", "FETCH_HEAD"], dir);
  if (!checkedOut.ok) {
    throw new Error(`checkout ${repo.id}@${repo.commit.slice(0, 8)} failed: ${checkedOut.stderr}`);
  }
  return dir;
}

/** File and line counts for a scanned target, the denominator for every per-KLOC rate. */
export async function measureSource(dir: string): Promise<{ files: number; lines: number }> {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const paths = [...glob.scanSync({ cwd: dir, absolute: true })].filter(
    (path) => !path.includes(`${"/"}node_modules${"/"}`),
  );
  const counts = await Promise.all(
    paths.map(async (path) => {
      const text = await Bun.file(path).text();
      return text.length === 0 ? 0 : text.split("\n").length;
    }),
  );
  return { files: paths.length, lines: counts.reduce((total, count) => total + count, 0) };
}
