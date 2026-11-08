import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSourceLock, sourceCacheKey } from "../../scripts/lib/source-lock.js";

const dirs: string[] = [];

async function fixture(): Promise<{ root: string; contentDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "tastepro-lock-"));
  dirs.push(root);
  const contentDir = join(root, "content");
  await mkdir(contentDir, { recursive: true });
  return { root, contentDir };
}

function lock(commit: string): string {
  return `${JSON.stringify(
    {
      version: 1,
      generatedAt: "2026-01-01",
      sources: [
        {
          id: "taste-skill",
          name: "Taste Skill",
          repo: "https://github.com/Leonxlnx/taste-skill",
          commit,
          license: "MIT",
          licenseUrl: "https://example.com/LICENSE",
          authors: ["Leonxlnx"],
          url: "",
          notes: "",
          paths: {},
        },
      ],
    },
    null,
    2,
  )}\n`;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("source lock", () => {
  it("prefers the human-edited root lock over the packaged copy", async () => {
    const { root, contentDir } = await fixture();
    await writeFile(join(root, "sources.lock.json"), lock("a".repeat(40)), "utf8");
    await writeFile(join(contentDir, "sources.lock.json"), lock("b".repeat(40)), "utf8");

    const loaded = await loadSourceLock(contentDir, root);
    expect(loaded.sources[0]?.commit).toBe("a".repeat(40));
  });

  it("falls back to the packaged lock when the root lock is absent", async () => {
    const { root, contentDir } = await fixture();
    await writeFile(join(contentDir, "sources.lock.json"), lock("b".repeat(40)), "utf8");

    const loaded = await loadSourceLock(contentDir, root);
    expect(loaded.sources[0]?.commit).toBe("b".repeat(40));
  });

  it("fails clearly when no lock exists", async () => {
    const { root, contentDir } = await fixture();
    await expect(loadSourceLock(contentDir, root)).rejects.toThrow(/sources\.lock\.json not found/);
  });

  it("keys cached sources by commit so pins cannot share stale bytes", () => {
    const first = sourceCacheKey({ id: "taste-skill", commit: "a".repeat(40) }, "library.json");
    const second = sourceCacheKey({ id: "taste-skill", commit: "b".repeat(40) }, "library.json");
    expect(first).not.toBe(second);
    expect(first).toContain("a".repeat(40));
    expect(first).toContain("library.json");
  });
});
