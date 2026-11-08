import { describe, expect, it } from "vitest";
import { clampMaxTokens, estimateTokens, fitJson, fitText } from "../../src/core/budget.js";

describe("token budget", () => {
  it("clamps requested budgets to a safe range", () => {
    expect(clampMaxTokens(undefined, 1000)).toBe(1000);
    expect(clampMaxTokens(1, 1000)).toBe(128);
    expect(clampMaxTokens(1_000_000, 1000)).toBe(24_000);
    expect(clampMaxTokens(Number.NaN, 1000)).toBe(1000);
  });

  it("estimates tokens from JSON or text", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens({ a: "abcd" })).toBeGreaterThanOrEqual(2);
  });

  it("returns text unchanged when it fits", () => {
    const result = fitText("short", 10);
    expect(result.truncated).toBe(false);
    expect(result.value).toBe("short");
  });

  it("truncates text with a visible notice and stays inside the budget", () => {
    const result = fitText("word ".repeat(1000), 128);
    expect(result.truncated).toBe(true);
    expect(result.tokens).toBeLessThanOrEqual(128);
    expect(result.value).toContain("truncated");
  });

  it("keeps a minimum text budget honest", () => {
    const result = fitText("word ".repeat(1000), 128);
    expect(result.value.length).toBeGreaterThan(100);
    expect(estimateTokens(result.value)).toBeLessThanOrEqual(128);
  });

  it("shortens long strings inside JSON before dropping keys", () => {
    const value = {
      id: "direction/x",
      name: "X",
      idea: "long ".repeat(500),
      optional: "keep?",
    };
    const result = fitJson(value, 120, {
      requiredKeys: ["id", "name", "idea"],
      optionalKeys: ["optional"],
    });
    expect(result.truncated).toBe(true);
    expect(result.value.id).toBe("direction/x");
    expect(result.value.name).toBe("X");
    expect(result.value.idea.length).toBeLessThan(value.idea.length);
    expect(result.tokens).toBeLessThanOrEqual(120);
  });

  it("drops optional keys when shortening is not enough", () => {
    const value = {
      id: "x",
      required: "r",
      optional: "o".repeat(5000),
      alsoOptional: "p".repeat(5000),
    };
    const result = fitJson(value, 128, {
      requiredKeys: ["id", "required"],
      optionalKeys: ["alsoOptional", "optional"],
    });
    expect(result.value).toMatchObject({ id: "x", required: "r" });
    expect(result.tokens).toBeLessThanOrEqual(128);
  });

  it("never exceeds the budget for a large nested payload", () => {
    const value = {
      total: 200,
      results: Array.from({ length: 200 }, (_, index) => ({
        id: `palette/item-${index}`,
        kind: "palette",
        name: `Item ${index}`,
        summary: "a long decision-oriented summary ".repeat(20),
        tags: Array.from({ length: 20 }, (_, tag) => `tag-${tag}`),
        domains: ["portfolios"],
        metrics: { score: index },
      })),
      hints: ["A hint that should not survive a tight budget."],
    };
    const result = fitJson(value, 128, {
      requiredKeys: ["total", "results"],
      arrayKeys: ["results"],
      itemKeys: ["id", "kind", "name", "summary"],
    });
    expect(result.truncated).toBe(true);
    expect(result.tokens).toBeLessThanOrEqual(128);
    expect(result.value.total).toBe(200);
    expect(result.value.results.length).toBeLessThan(200);
    expect(result.value.results[0]?.id).toBe("palette/item-0");
    expect(value.results[0]?.tags).toHaveLength(20);
  });

  it("keeps provenance and source URLs exact or omits them, never truncates", () => {
    const value = {
      id: "direction/x",
      kind: "direction",
      name: "X",
      summary: "a long decision summary ".repeat(100),
      sourceUrl: "https://github.com/example/repo/blob/0123456789abcdef/skills/x.md",
      provenance: {
        source: "taste-skill",
        repo: "https://github.com/example/repo",
        commit: "0123456789abcdef0123456789abcdef01234567",
        license: "MIT",
        authors: ["Example"],
        url: "https://github.com/example/repo",
      },
      noise: "noise ".repeat(1000),
    };
    const result = fitJson(value, 220, {
      requiredKeys: ["id", "kind", "name", "summary", "sourceUrl", "provenance"],
      arrayKeys: [],
      itemKeys: ["id", "kind", "name", "summary", "provenance", "sourceUrl"],
    });
    expect(result.truncated).toBe(true);
    expect(result.value.id).toBe("direction/x");
    expect(result.value.sourceUrl).toBe(value.sourceUrl);
    expect(result.value.provenance).toEqual(value.provenance);
    expect(result.value.summary.length).toBeLessThan(value.summary.length);
    expect(result.tokens).toBeLessThanOrEqual(220);
  });

  it("drops provenance as a whole rather than truncating it", () => {
    const value = {
      id: "direction/x",
      kind: "direction",
      name: "X",
      provenance: {
        commit: "a".repeat(40),
        repo: "https://github.com/example/repo",
        license: "MIT",
      },
    };
    const result = fitJson(value, 128, {
      requiredKeys: ["id", "kind", "name", "provenance"],
      arrayKeys: [],
      itemKeys: ["id", "kind", "name", "provenance"],
    });
    const provenance = (result.value as { provenance?: { commit?: string } }).provenance;
    if (provenance) expect(provenance.commit).toBe("a".repeat(40));
    expect(result.tokens).toBeLessThanOrEqual(128);
  });

  it("drops array items and optional fields instead of exceeding the budget", () => {
    const value = {
      id: "response",
      packs: Array.from({ length: 20 }, (_, index) => ({
        id: `direction/${index}`,
        kind: "direction",
        name: `Direction ${index}`,
        summary: "summary ".repeat(200),
        provenance: { commit: "a".repeat(40) },
      })),
    };
    const result = fitJson(value, 128, {
      requiredKeys: ["id", "packs"],
      arrayKeys: ["packs"],
      itemKeys: ["id", "kind", "name", "summary"],
    });
    expect(result.tokens).toBeLessThanOrEqual(128);
    expect(result.value.packs.length).toBeLessThan(20);
    expect(result.value.packs[0]?.id).toBe("direction/0");
  });
});
