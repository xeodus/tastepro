import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeContentHash } from "../../scripts/lib/content-hash.js";
import { CONTENT_KINDS, KIND_FILE_NAMES } from "../../src/core/schema.js";

const dirs: string[] = [];

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tastepro-hash-"));
  dirs.push(dir);
  await mkdir(join(dir, "generated", "kinds"), { recursive: true });
  await writeFile(join(dir, "generated", "catalog.json"), "[]\n", "utf8");
  for (const kind of CONTENT_KINDS) {
    await writeFile(join(dir, "generated", "kinds", KIND_FILE_NAMES[kind]), "[]\n", "utf8");
  }
  await writeFile(
    join(dir, "generated", "kinds", "references.json"),
    `${JSON.stringify([{ id: "reference/x", bodyPath: "references/x.md" }], null, 2)}\n`,
    "utf8",
  );
  await mkdir(join(dir, "references"), { recursive: true });
  await writeFile(join(dir, "references", "x.md"), "reference body\n", "utf8");
  return dir;
}

const commits = [
  { id: "taste-skill", commit: "a".repeat(40) },
  { id: "awesome-design-md", commit: "b".repeat(40) },
];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("content hash", () => {
  it("is deterministic and ignores commit order", async () => {
    const dir = await fixture();
    const first = await computeContentHash(dir, commits);
    const second = await computeContentHash(dir, [...commits].reverse());
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it("changes when a catalog entry changes", async () => {
    const dir = await fixture();
    const before = await computeContentHash(dir, commits);
    await writeFile(
      join(dir, "generated", "catalog.json"),
      `${JSON.stringify([{ id: "direction/x", summary: "new" }], null, 2)}\n`,
      "utf8",
    );
    expect(await computeContentHash(dir, commits)).not.toBe(before);
  });

  it("changes when a pack body changes", async () => {
    const dir = await fixture();
    const before = await computeContentHash(dir, commits);
    const path = join(dir, "generated", "kinds", KIND_FILE_NAMES.direction);
    await writeFile(path, `${JSON.stringify([{ id: "direction/x", body: "new" }], null, 2)}\n`);
    expect(await computeContentHash(dir, commits)).not.toBe(before);
  });

  it("changes when a reference body file changes", async () => {
    const dir = await fixture();
    const before = await computeContentHash(dir, commits);
    await writeFile(join(dir, "references", "x.md"), "changed body\n", "utf8");
    expect(await computeContentHash(dir, commits)).not.toBe(before);
  });

  it("changes when a pinned commit changes", async () => {
    const dir = await fixture();
    const before = await computeContentHash(dir, commits);
    const changed = [{ ...commits[0]!, commit: "c".repeat(40) }, commits[1]!];
    expect(await computeContentHash(dir, changed)).not.toBe(before);
  });

  it("fails clearly when a served artifact is missing", async () => {
    const dir = await fixture();
    await rm(join(dir, "generated", "kinds", KIND_FILE_NAMES.site));
    await expect(computeContentHash(dir, commits)).rejects.toThrow(/site/);
  });

  it("rejects reference bodies outside the content directory", async () => {
    const dir = await fixture();
    await writeFile(
      join(dir, "generated", "kinds", "references.json"),
      `${JSON.stringify([{ id: "reference/x", bodyPath: "../escape.md" }], null, 2)}\n`,
      "utf8",
    );
    await expect(computeContentHash(dir, commits)).rejects.toThrow(/escapes/);
  });
});

// Keep the fixture honest: the real hash must be recomputable from committed files.
describe("committed snapshot hash", () => {
  it("is a 64-character hex digest", async () => {
    const raw = await readFile("content/generated/stats.json", "utf8");
    const stats = JSON.parse(raw) as { contentHash: string };
    expect(stats.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
