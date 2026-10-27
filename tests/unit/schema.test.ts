import { describe, expect, it } from "vitest";
import {
  CatalogEntrySchema,
  CONTENT_KINDS,
  KIND_FILE_NAMES,
  KIND_PRIORITY,
  PackSchema,
  QUALITY_LEVELS,
  SOURCE_IDS,
} from "../../src/core/schema.js";

const provenance = {
  source: "tastepro" as const,
  repo: "",
  commit: "workspace",
  path: "content/test.json",
  license: "Apache-2.0",
  authors: ["TastePro"],
  url: "",
  transformations: [],
};

describe("content schema", () => {
  it("defines every kind consistently", () => {
    expect(Object.keys(KIND_FILE_NAMES).sort()).toEqual([...CONTENT_KINDS].sort());
    expect(Object.keys(KIND_PRIORITY).sort()).toEqual([...CONTENT_KINDS].sort());
    expect(new Set(Object.values(KIND_FILE_NAMES)).size).toBe(CONTENT_KINDS.length);
  });

  it("parses a minimal pack and fills kind defaults", () => {
    const parsed = PackSchema.parse({
      id: "direction/test",
      kind: "direction",
      name: "Test",
      summary: "A test direction.",
      quality: "verified",
      provenance,
    });
    expect(parsed.kind).toBe("direction");
    if (parsed.kind === "direction") {
      expect(parsed.idea).toBe("");
      expect(parsed.seenIn).toEqual([]);
    }
  });

  it("rejects unknown kinds and qualities", () => {
    expect(() =>
      PackSchema.parse({
        id: "thing/test",
        kind: "thing",
        name: "Test",
        summary: "Nope",
        quality: "verified",
        provenance,
      }),
    ).toThrow();
    expect(() =>
      CatalogEntrySchema.parse({
        id: "domain/test",
        kind: "domain",
        name: "Test",
        summary: "Test",
        quality: "excellent",
        source: "tastepro",
      }),
    ).toThrow();
  });

  it("defaults catalog arrays", () => {
    const entry = CatalogEntrySchema.parse({
      id: "domain/test",
      kind: "domain",
      name: "Test",
      summary: "Test",
      quality: "verified",
      source: "tastepro",
    });
    expect(entry.domains).toEqual([]);
    expect(entry.tags).toEqual([]);
    expect(entry.moods).toEqual([]);
    expect(entry.sectors).toEqual([]);
  });

  it("accepts every declared quality and source", () => {
    for (const quality of QUALITY_LEVELS) {
      expect(
        CatalogEntrySchema.parse({
          id: "domain/test",
          kind: "domain",
          name: "Test",
          summary: "Test",
          quality,
          source: "tastepro",
        }).quality,
      ).toBe(quality);
    }
    for (const source of SOURCE_IDS) {
      expect(
        CatalogEntrySchema.parse({
          id: "domain/test",
          kind: "domain",
          name: "Test",
          summary: "Test",
          quality: "verified",
          source,
        }).source,
      ).toBe(source);
    }
  });

  it("parses a domain playbook with defaults", () => {
    const parsed = PackSchema.parse({
      id: "domain/test",
      kind: "domain",
      name: "Test",
      summary: "Test",
      quality: "verified",
      provenance,
      playbook: { audience: ["a"], jobs: ["j"] },
    });
    if (parsed.kind !== "domain") throw new Error("wrong kind");
    expect(parsed.playbook?.audience).toEqual(["a"]);
    expect(parsed.playbook?.questions).toEqual([]);
    expect(parsed.status).toBe("planned");
    expect(parsed.depth).toBe("taxonomy");
  });
});
