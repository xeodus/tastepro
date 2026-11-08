import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const DERIVED_ENTRIES = new Set(["generated", "references", "sources", "sources.lock.json"]);

export interface SnapshotValidation {
  errors: string[];
  warnings?: string[];
}

function uniqueSuffix(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a sibling staging directory on the same filesystem as the content
 * directory. Authored inputs are copied; all derived output is regenerated.
 */
export async function prepareStaging(contentDir: string): Promise<string> {
  const staging = `${contentDir}.ingest-${uniqueSuffix()}`;
  await mkdir(staging, { recursive: false });
  try {
    if (await exists(contentDir)) {
      for (const entry of await readdir(contentDir, { withFileTypes: true })) {
        if (DERIVED_ENTRIES.has(entry.name)) continue;
        await cp(join(contentDir, entry.name), join(staging, entry.name), {
          recursive: entry.isDirectory(),
          preserveTimestamps: true,
        });
      }
    }
    await mkdir(join(staging, "generated"), { recursive: true });
    await mkdir(join(staging, "references"), { recursive: true });
    await mkdir(join(staging, "sources", "licenses"), { recursive: true });
    return staging;
  } catch (error) {
    await discardStaging(staging);
    throw error;
  }
}

export async function discardStaging(staging: string): Promise<void> {
  await rm(staging, { recursive: true, force: true });
}

/**
 * Validate a staged snapshot before exposing it. The swap uses two renames on
 * the same filesystem: the previous snapshot is restored if the second rename
 * fails. A validation failure leaves the live snapshot untouched.
 */
export async function commitSnapshot(
  contentDir: string,
  staging: string,
  validate: (directory: string) => Promise<SnapshotValidation>,
): Promise<void> {
  let report: SnapshotValidation;
  try {
    report = await validate(staging);
  } catch (error) {
    await discardStaging(staging);
    throw error;
  }
  if (report.errors.length > 0) {
    await discardStaging(staging);
    throw new Error(
      `Snapshot validation failed:\n${report.errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }

  const backup = `${contentDir}.previous-${uniqueSuffix()}`;
  const hadPrevious = await exists(contentDir);
  try {
    if (hadPrevious) await rename(contentDir, backup);
    await rename(staging, contentDir);
  } catch (error) {
    if (hadPrevious) {
      try {
        await rename(backup, contentDir);
      } catch {
        // Preserve the original failure; the backup remains on disk for recovery.
      }
    }
    await discardStaging(staging);
    throw error;
  }
  if (hadPrevious) {
    try {
      await rm(backup, { recursive: true, force: true });
    } catch {
      // The committed snapshot is live; a leftover backup is harmless.
    }
  }
}
