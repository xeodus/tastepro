import type { Pack, Provenance, ReferencePack, SourceInfo } from "../../../src/core/schema.js";
import type { LockSource } from "../source-lock.js";

/**
 * Context passed to a source adapter. The adapter never touches the network or
 * the filesystem directly; the ingest runner provides cached fetches and the
 * provenance factory. This keeps adapters deterministic and testable.
 */
export interface SourceContext {
  source: LockSource;
  fetchText(path: string): Promise<string>;
  fetchJson<T>(path: string): Promise<T>;
  provenance(path: string, transformations?: string[]): Provenance;
  sourceUrl(path?: string): string;
  /** Writes the locked license text into content/sources/licenses. */
  writeLicense(): Promise<string>;
}

export interface SourceResult {
  packs: Pack[];
  references: ReferencePack[];
  sourceInfo: SourceInfo;
  warnings: string[];
}

export interface SourceAdapter {
  id: string;
  fetch(context: SourceContext): Promise<SourceResult>;
}
