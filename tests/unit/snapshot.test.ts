import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitSnapshot, discardStaging, prepareStaging } from "../../scripts/lib/snapshot.js";

const dirs: string[] = [];

async function fixture(): Promise<{ root: string; contentDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "tastepro-snapshot-"));
  dirs.push(root);
  const contentDir = join(root, "content");
  await mkdir(join(contentDir, "generated"), { recursive: true });
  await mkdir(join(contentDir, "taxonomy"), { recursive: true });
  await mkdir(join(contentDir, "references"), { recursive: true });
  await mkdir(join(contentDir, "sources", "licenses"), { recursive: true });
  await writeFile(join(contentDir, "generated", "catalog.json"), "old catalog\n", "utf8");
  await writeFile(join(contentDir, "taxonomy", "domains.json"), "authored taxonomy\n", "utf8");
  await writeFile(join(contentDir, "references", "old.md"), "old reference\n", "utf8");
  await writeFile(join(contentDir, "sources", "licenses", "old.txt"), "old license\n", "utf8");
  await writeFile(join(contentDir, "sources.lock.json"), "old lock\n", "utf8");
  await writeFile(join(contentDir, "LICENSE"), "content license\n", "utf8");
  return { root, contentDir };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("snapshot staging", () => {
  it("copies authored inputs but not derived output", async () => {
    const { contentDir } = await fixture();
    const staging = await prepareStaging(contentDir);
    const entries = await readdir(staging);
    expect(entries.sort()).toEqual(["LICENSE", "generated", "references", "sources", "taxonomy"]);
    expect(await readFile(join(staging, "taxonomy", "domains.json"), "utf8")).toBe(
      "authored taxonomy\n",
    );
  });

  it("leaves the previous snapshot untouched when validation fails", async () => {
    const { contentDir } = await fixture();
    const staging = await prepareStaging(contentDir);
    await mkdir(join(staging, "generated"), { recursive: true });
    await writeFile(join(staging, "generated", "catalog.json"), "new catalog\n", "utf8");

    await expect(
      commitSnapshot(contentDir, staging, async () => ({ errors: ["bad snapshot"] })),
    ).rejects.toThrow(/bad snapshot/);

    expect(await readFile(join(contentDir, "generated", "catalog.json"), "utf8")).toBe(
      "old catalog\n",
    );
    expect(await readFile(join(contentDir, "taxonomy", "domains.json"), "utf8")).toBe(
      "authored taxonomy\n",
    );
    await expect(readdir(staging)).rejects.toThrow();
  });

  it("swaps in a validated snapshot and removes derived leftovers", async () => {
    const { contentDir } = await fixture();
    const staging = await prepareStaging(contentDir);
    await mkdir(join(staging, "generated"), { recursive: true });
    await writeFile(join(staging, "generated", "catalog.json"), "new catalog\n", "utf8");
    await writeFile(join(staging, "sources.lock.json"), "new lock\n", "utf8");

    await commitSnapshot(contentDir, staging, async () => ({ errors: [] }));

    expect(await readFile(join(contentDir, "generated", "catalog.json"), "utf8")).toBe(
      "new catalog\n",
    );
    expect(await readFile(join(contentDir, "taxonomy", "domains.json"), "utf8")).toBe(
      "authored taxonomy\n",
    );
    expect(await readFile(join(contentDir, "sources.lock.json"), "utf8")).toBe("new lock\n");
    expect(await readdir(join(contentDir, "references"))).toEqual([]);
    expect(await readdir(join(contentDir, "sources", "licenses"))).toEqual([]);
    const siblings = await readdir(join(contentDir, ".."));
    expect(
      siblings.filter((name) => name.includes(".ingest-") || name.includes(".previous-")),
    ).toEqual([]);
  });

  it("removes staging without touching content when discarded", async () => {
    const { contentDir } = await fixture();
    const staging = await prepareStaging(contentDir);
    await discardStaging(staging);
    await expect(readdir(staging)).rejects.toThrow();
    expect(await readFile(join(contentDir, "generated", "catalog.json"), "utf8")).toBe(
      "old catalog\n",
    );
  });
});
