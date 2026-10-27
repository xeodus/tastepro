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

  it("truncates text with a visible notice", () => {
    const result = fitText("word ".repeat(1000), 20);
    expect(result.truncated).toBe(true);
    expect(result.tokens).toBeLessThanOrEqual(24);
    expect(result.value).toContain("truncated");
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
    expect(result.tokens).toBeLessThanOrEqual(130);
  });

  it("drops optional keys when shortening is not enough", () => {
    const value = {
      id: "x",
      required: "r",
      optional: "o".repeat(5000),
      alsoOptional: "p".repeat(5000),
    };
    const result = fitJson(value, 80, {
      requiredKeys: ["id", "required"],
      optionalKeys: ["alsoOptional", "optional"],
    });
    expect(result.value).toMatchObject({ id: "x", required: "r" });
    expect(result.tokens).toBeLessThanOrEqual(90);
  });
});
