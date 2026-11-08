import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../src/core/budget.js";
import { createTasteProContext } from "../../src/server/context.js";

const context = createTasteProContext();

describe("guidelines service", () => {
  it("returns the full rubric by default", async () => {
    const response = await context.guidelines.get();
    expect(response.format).toBe("json");
    expect(response.total).toBe(104);
    expect(response.returned).toBeGreaterThan(0);
    expect(response.returned).toBeLessThanOrEqual(20);
    expect(response.truncated).toBe(true);
    expect(response.categories).toHaveLength(17);
    expect(response.rules.every((rule) => rule.id.startsWith("guideline/"))).toBe(true);
    expect(response.rules.every((rule) => rule.sourcePath.length > 0)).toBe(true);
    expect(response.rules.every((rule) => rule.line > 0)).toBe(true);
  });

  it("finds rules by topic", async () => {
    const response = await context.guidelines.get({ query: "focus", limit: 50 });
    expect(response.total).toBeGreaterThan(5);
    expect(response.rules.some((rule) => rule.category === "Focus States")).toBe(true);
    expect(response.rules.some((rule) => rule.text.toLowerCase().includes("focus"))).toBe(true);
  });

  it("filters by category, including partial categories", async () => {
    const exact = await context.guidelines.get({ category: "Focus States", limit: 20 });
    expect(exact.total).toBe(5);
    expect(exact.rules.every((rule) => rule.category === "Focus States")).toBe(true);

    const partial = await context.guidelines.get({ category: "focus", limit: 20 });
    expect(partial.total).toBe(exact.total);

    const anti = await context.guidelines.get({ category: "Anti-patterns", limit: 50 });
    expect(anti.total).toBe(14);
    expect(anti.rules.every((rule) => rule.category === "Anti-patterns (flag these)")).toBe(true);
  });

  it("filters by severity", async () => {
    const errors = await context.guidelines.get({ severity: "error", limit: 104 });
    expect(errors.total).toBe(22);
    expect(errors.rules.every((rule) => rule.severity === "error")).toBe(true);

    const warns = await context.guidelines.get({ severity: "warn", limit: 104 });
    expect(warns.total).toBe(82);
    expect(warns.rules.every((rule) => rule.severity === "warn")).toBe(true);

    const combined = await context.guidelines.get({
      severity: "error",
      category: "Focus States",
      limit: 20,
    });
    expect(combined.rules.every((rule) => rule.severity === "error")).toBe(true);
    expect(combined.rules.every((rule) => rule.category === "Focus States")).toBe(true);
  });

  it("renders a checklist in Markdown", async () => {
    const response = await context.guidelines.get({
      category: "Focus States",
      format: "markdown",
      limit: 5,
    });
    expect(response.markdown).toContain("# Web interface guidelines");
    expect(response.markdown).toContain("- [ ] **");
    expect(response.markdown).toContain("## Focus States");
    expect(response.markdown).toContain("`guideline/");
    expect(response.truncated).toBe(false);
  });

  it("marks must-fix rules in Markdown", async () => {
    const response = await context.guidelines.get({
      severity: "error",
      format: "markdown",
      limit: 5,
    });
    expect(response.markdown).toContain("**MUST FIX**");
    expect(response.markdown).not.toContain("**SHOULD**");
  });

  it("honors the limit and reports truncation", async () => {
    const response = await context.guidelines.get({ limit: 3 });
    expect(response.returned).toBe(3);
    expect(response.total).toBe(104);
    expect(response.truncated).toBe(true);

    const all = await context.guidelines.get({ limit: 104, maxTokens: 24_000 });
    expect(all.returned).toBe(104);
    expect(all.truncated).toBe(false);
  });

  it("fits the JSON budget", async () => {
    const response = await context.guidelines.get({
      query: "focus",
      limit: 50,
      maxTokens: 128,
    });
    expect(response.truncated).toBe(true);
    expect(response.rules.length).toBeLessThan(50);
    expect(estimateTokens(response)).toBeLessThanOrEqual(128);
  });

  it("fits the Markdown budget", async () => {
    const response = await context.guidelines.get({
      query: "focus",
      format: "markdown",
      limit: 50,
      maxTokens: 128,
    });
    expect(response.truncated).toBe(true);
    expect(estimateTokens(response.markdown ?? "")).toBeLessThanOrEqual(128);
    expect(response.markdown).toContain("truncated");
  });

  it("returns hints when a topic has no rules", async () => {
    const response = await context.guidelines.get({ query: "zzzzzz-not-a-rule" });
    expect(response.total).toBe(0);
    expect(response.rules).toHaveLength(0);
    expect(response.hints.join(" ")).toMatch(/No matching rules/);
    expect(response.hints.join(" ")).toMatch(/severity=error/);
  });

  it("lists category counts that sum to the rubric size", async () => {
    const categories = await context.guidelines.categories();
    expect(categories).toHaveLength(17);
    expect(categories.reduce((sum, category) => sum + category.count, 0)).toBe(104);
    expect(categories.map((category) => category.name)).toContain("Accessibility");
  });

  it("is deterministic", async () => {
    const first = await context.guidelines.get({ query: "motion", limit: 12 });
    const second = await context.guidelines.get({ query: "motion", limit: 12 });
    expect(first.rules.map((rule) => rule.id)).toEqual(second.rules.map((rule) => rule.id));
  });
});
