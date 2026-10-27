import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeContrast,
  parseDesignMarkdown,
  resolveTokenReferences,
} from "../../scripts/lib/brand.js";

const provenance = {
  source: "awesome-design-md" as const,
  repo: "https://github.com/VoltAgent/awesome-design-md",
  commit: "3b605329240ce735b510037cca322f1831fdd7f8",
  path: "design-md/claude/DESIGN.md",
  license: "MIT",
  authors: ["VoltAgent"],
  url: "https://getdesign.md/claude/design-md",
  transformations: ["resolved token references"],
};

describe("brand parser", () => {
  it("resolves token references recursively", () => {
    const root = {
      colors: { primary: "#cc785c", canvas: "#faf9f5" },
      rounded: { md: "8px" },
      components: {
        button: { backgroundColor: "{colors.primary}", rounded: "{rounded.md}" },
      },
    };
    const result = resolveTokenReferences(root);
    expect(result.value.components).toEqual({
      button: { backgroundColor: "#cc785c", rounded: "8px" },
    });
    expect(result.unresolved).toEqual([]);
  });

  it("reports unresolved token references without throwing", () => {
    const result = resolveTokenReferences({ a: "{colors.missing}" });
    expect(result.value.a).toBe("{colors.missing}");
    expect(result.unresolved).toEqual(["colors.missing"]);
  });

  it("computes WCAG contrast ratios", () => {
    expect(computeContrast("#000000", "#ffffff").ratio).toBeCloseTo(21, 0);
    expect(computeContrast("#777777", "#ffffff").ratio).toBeGreaterThan(4);
    expect(computeContrast("#777777", "#ffffff").aaNormal).toBe(false);
    expect(computeContrast("#000000", "#ffffff").aaaNormal).toBe(true);
  });

  it("parses the pinned Claude DESIGN.md", () => {
    const raw = readFileSync(
      new URL("../../.cache/research/awesome-design-md/claude.md", import.meta.url),
      "utf8",
    );
    const pack = parseDesignMarkdown(raw, {
      id: "brand/claude",
      slug: "claude",
      displayName: "Claude",
      category: "AI & LLM Platforms",
      provenance,
      sourceUrl: "https://getdesign.md/claude/design-md",
    });
    expect(pack.id).toBe("brand/claude");
    expect(pack.kind).toBe("brand");
    expect(pack.name).toBe("Claude");
    expect(pack.quality).toBe("reference");
    expect(pack.colors.primary).toBe("#cc785c");
    expect(pack.colors.canvas).toBe("#faf9f5");
    expect(Object.keys(pack.typography).length).toBeGreaterThan(2);
    expect(Object.keys(pack.components).length).toBeGreaterThan(2);
    expect(pack.contrast["ink-on-canvas"]?.ratio).toBeGreaterThan(10);
    expect(pack.unresolvedTokens).toEqual([]);
  });

  it("repairs unquoted prose colons in upstream frontmatter", () => {
    const pack = parseDesignMarkdown(
      [
        "---",
        "version: alpha",
        "name: Repaired",
        "description: A warm product: it uses ink on canvas and a single accent.",
        "colors:",
        '  ink: "#111111"',
        '  canvas: "#ffffff"',
        '  muted: "#666666"',
        "typography:",
        '  body: { fontFamily: "Inter" }',
        '  display: { fontFamily: "Inter Display" }',
        "rounded:",
        '  md: "8px"',
        "spacing:",
        '  md: "16px"',
        "components:",
        '  button: { backgroundColor: "{colors.ink}" }',
        "---",
        "",
        "# Repaired",
      ].join("\n"),
      {
        id: "brand/repaired",
        slug: "repaired",
        displayName: "Repaired",
        category: "Test",
        provenance,
      },
    );
    expect(pack.quality).toBe("reference");
    expect(pack.description).toContain("A warm product: it uses ink");
    expect(pack.colors.ink).toBe("#111111");
    expect(pack.provenance.transformations).toContain("repaired unquoted YAML prose values");
  });

  it("marks a stub as incomplete", () => {
    const pack = parseDesignMarkdown(
      "---\nversion: alpha\nname: Stub\ndescription: short\n---\n\n# Stub\n",
      {
        id: "brand/stub",
        slug: "stub",
        displayName: "Stub",
        category: "Test",
        provenance,
      },
    );
    expect(pack.quality).toBe("incomplete");
    expect(pack.incompleteReasons.length).toBeGreaterThan(0);
  });
});
