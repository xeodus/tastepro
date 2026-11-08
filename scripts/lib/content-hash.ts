import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { CONTENT_KINDS, KIND_FILE_NAMES } from "../../src/core/schema.js";

export interface SnapshotCommit {
  id: string;
  commit: string;
}

interface ReferenceFile {
  id?: string;
  bodyPath: string;
}

const SNAPSHOT_FILES = [
  join("generated", "catalog.json"),
  ...CONTENT_KINDS.map((kind) => join("generated", "kinds", KIND_FILE_NAMES[kind])),
];

async function readSnapshotFile(contentDir: string, path: string, label: string): Promise<string> {
  try {
    return await readFile(join(contentDir, path), "utf8");
  } catch (error) {
    throw new Error(
      `Cannot hash ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Hash the exact bytes the runtime can serve. This deliberately includes full
 * pack files (including embedded reference bodies) and the readable reference
 * Markdown, not just the compact catalog. Ingest and validation must both use
 * this function so the committed hash proves snapshot integrity.
 *
 * `generated/sources.json` is excluded because it carries ingest timestamps;
 * source pins are covered by `commits` and by pack provenance.
 */
export async function computeContentHash(
  contentDir: string,
  commits: readonly SnapshotCommit[],
): Promise<string> {
  const hash = createHash("sha256");
  const update = (label: string, value: string): void => {
    hash.update(`${label}\0${Buffer.byteLength(value, "utf8")}\0`);
    hash.update(value, "utf8");
  };

  for (const path of SNAPSHOT_FILES) {
    update(path, await readSnapshotFile(contentDir, path, "snapshot file"));
  }

  const referencesRaw = await readSnapshotFile(
    contentDir,
    join("generated", "kinds", KIND_FILE_NAMES.reference),
    "reference index",
  );
  let references: ReferenceFile[];
  try {
    references = JSON.parse(referencesRaw) as ReferenceFile[];
  } catch (error) {
    throw new Error(
      `Cannot hash reference index: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(references)) throw new Error("Cannot hash reference index: expected an array");

  const referenceBodies = references
    .map((reference) => reference.bodyPath)
    .filter((bodyPath): bodyPath is string => Boolean(bodyPath))
    .sort();
  for (const bodyPath of referenceBodies) {
    const absolute = resolve(contentDir, bodyPath);
    const relativePath = relative(contentDir, absolute);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(`Reference body path escapes the content directory: ${bodyPath}`);
    }
    update(bodyPath, await readSnapshotFile(contentDir, bodyPath, "reference body"));
  }

  const pins = [...commits]
    .map(({ id, commit }) => [id, commit] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  update("commits", JSON.stringify(pins));
  return hash.digest("hex");
}
