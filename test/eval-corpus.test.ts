import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertOwnRepository, targetSlug } from "../eval/corpus.ts";

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "strata-eval-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("eval corpus checkout fence", () => {
  test("accepts a directory that is its own repository root", () => {
    withTempDir((dir) => {
      Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
      expect(() => assertOwnRepository(dir)).not.toThrow();
    });
  });

  test("refuses a plain directory nested inside another repository", () => {
    withTempDir((outer) => {
      Bun.spawnSync(["git", "init", "-q"], { cwd: outer });
      const nested = join(outer, "checkouts", "some-repo");
      mkdirSync(nested, { recursive: true });
      // Without the fence git answers about `outer` here, and every later
      // command in checkout() would mutate the enclosing repository.
      expect(() => assertOwnRepository(nested)).toThrow(/refusing to run git/);
    });
  });

  test("refuses a directory that is no repository at all", () => {
    withTempDir((dir) => {
      expect(() => assertOwnRepository(dir)).toThrow(/no repository/);
    });
  });
});

describe("result identity", () => {
  test("target slug is filesystem-safe and keeps repo and target distinct", () => {
    expect(targetSlug("next", "packages/next/src")).toBe("next__packages-next-src");
  });
});
