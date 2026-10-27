import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../src/core/budget.js";
import { createTasteProContext } from "../../src/server/context.js";

const context = createTasteProContext();

describe("catalog search", () => {
  it("returns a curated browse list when the query is empty", async () => {
    const response = await context.search.search({ limit: 6 });
    expect(response.match).toBe("browse");
    expect(response.query).toBe("");
    expect(response.total).toBe(863);
    expect(response.results).toHaveLength(6);
    expect(response.results[0]?.kind).toBe("domain");
    expect(response.results[0]?.status).not.toBe("planned");
    expect(response.results.every((card) => card.quality !== "incomplete")).toBe(true);
  });

  it("maps natural language to canonical domains", async () => {
    await expect(context.search.domainsForQuery("fintech dashboard")).resolves.toEqual(
      expect.arrayContaining(["fintech-payments", "data-analytics", "product-surfaces"]),
    );
    await expect(context.search.domainsForQuery("devtools")).resolves.toContain("developer-tools");
    await expect(context.search.domainsForQuery("restaurant menu")).resolves.toEqual([
      "restaurants-food",
    ]);
    await expect(context.search.domainsForQuery("real estate")).resolves.toEqual(["real-estate"]);
    await expect(context.search.domainsForQuery("healthcare booking")).resolves.toEqual(
      expect.arrayContaining(["healthcare-wellness", "travel-hospitality", "marketplaces"]),
    );
    await expect(context.search.domainsForQuery("")).resolves.toEqual([]);
  });

  it("does not let a generic role alias override a specific tool phrase", async () => {
    await expect(context.search.domainsForQuery("dark developer tool")).resolves.toEqual([
      "developer-tools",
    ]);
    await expect(context.search.domainsForQuery("developer portfolio")).resolves.toEqual([
      "portfolios",
    ]);
  });

  it("ranks the matching domain playbook first", async () => {
    const fintech = await context.search.search({ query: "fintech dashboard", limit: 5 });
    expect(fintech.results[0]?.id).toBe("domain/fintech-payments");
    expect(fintech.results[1]?.id).toBe("domain/product-surfaces");
    expect(fintech.match).toBe("any-term");
    expect(fintech.matchedAllTerms).toBeGreaterThanOrEqual(1);
    expect(fintech.matchedAllTerms).toBeLessThan(fintech.total);

    const restaurant = await context.search.search({ query: "restaurant menu", limit: 5 });
    expect(restaurant.results[0]?.id).toBe("domain/restaurants-food");
    expect(restaurant.results[1]?.kind).toBe("section");

    const devtools = await context.search.search({ query: "dark developer tool", limit: 5 });
    expect(devtools.results[0]?.id).toBe("domain/developer-tools");
    expect(devtools.results.some((card) => card.id === "domain/portfolios")).toBe(false);
  });

  it("falls back to same-family playbooks for taxonomy-only domains", async () => {
    const response = await context.search.search({ query: "automotive", limit: 8 });
    expect(response.results[0]?.id).toBe("domain/automotive");
    expect(response.familyFallback).toEqual([
      "ecommerce-dtc",
      "restaurants-food",
      "travel-hospitality",
    ]);
    expect(response.results.map((card) => card.id)).toEqual(
      expect.arrayContaining([
        "domain/automotive",
        "domain/ecommerce-dtc",
        "domain/restaurants-food",
        "domain/travel-hospitality",
      ]),
    );
    expect(response.hints.join(" ")).toMatch(/Family fallback/);

    // An explicit domain filter stays literal.
    const filtered = await context.search.search({
      query: "automotive",
      domain: "automotive",
      limit: 8,
    });
    expect(filtered.familyFallback).toEqual([]);
    expect(filtered.results.every((card) => card.domains.includes("automotive"))).toBe(true);
  });

  it("does not invent a family fallback when the family has no playbook", async () => {
    const response = await context.search.search({ query: "energy climate", limit: 8 });
    expect(response.familyFallback).toEqual([]);
    expect(response.results.some((card) => card.id === "domain/energy-climate")).toBe(true);
  });

  it("filters by kind, domain, quality, and source", async () => {
    const sections = await context.search.search({
      query: "menu",
      kinds: ["section"],
      limit: 10,
    });
    expect(sections.results.every((card) => card.kind === "section")).toBe(true);

    const fintech = await context.search.search({
      domain: "fintech-payments",
      limit: 20,
    });
    expect(fintech.results.every((card) => card.domains.includes("fintech-payments"))).toBe(true);
    expect(fintech.results.some((card) => card.id === "domain/fintech-payments")).toBe(true);

    const brands = await context.search.search({
      query: "stripe",
      kinds: ["brand"],
      source: "awesome-design-md",
      limit: 10,
    });
    expect(brands.results.length).toBeGreaterThan(0);
    expect(brands.results.every((card) => card.kind === "brand")).toBe(true);
    expect(brands.results.every((card) => card.source === "awesome-design-md")).toBe(true);

    const verified = await context.search.search({
      query: "portfolio",
      quality: ["verified"],
      limit: 10,
    });
    expect(verified.results.every((card) => card.quality === "verified")).toBe(true);
  });

  it("excludes incomplete packs by default and includes them on request", async () => {
    const hidden = await context.search.search({
      query: "spotify",
      kinds: ["brand"],
      limit: 5,
    });
    expect(hidden.results).toHaveLength(0);

    const visible = await context.search.search({
      query: "spotify",
      kinds: ["brand"],
      includeIncomplete: true,
      limit: 5,
    });
    expect(visible.results[0]?.id).toBe("brand/spotify");
    expect(visible.results[0]?.quality).toBe("incomplete");
  });

  it("excludes planned domains when includePlanned is false", async () => {
    const withPlanned = await context.search.search({
      query: "data analytics",
      kinds: ["domain"],
      limit: 10,
    });
    expect(withPlanned.results.some((card) => card.id === "domain/data-analytics")).toBe(true);

    const withoutPlanned = await context.search.search({
      query: "data analytics",
      kinds: ["domain"],
      includePlanned: false,
      limit: 10,
    });
    expect(withoutPlanned.results.some((card) => card.id === "domain/data-analytics")).toBe(false);
  });

  it("clamps limits and stays deterministic", async () => {
    const one = await context.search.search({ query: "portfolio", limit: 0 });
    expect(one.returned).toBe(1);

    const many = await context.search.search({ query: "portfolio", limit: 500 });
    expect(many.returned).toBeLessThanOrEqual(50);

    const first = await context.search.search({ query: "quiet editorial portfolio", limit: 12 });
    const second = await context.search.search({ query: "quiet editorial portfolio", limit: 12 });
    expect(first.results.map((card) => card.id)).toEqual(second.results.map((card) => card.id));
    expect(first.total).toBe(second.total);
  });

  it("fits the response budget", async () => {
    const response = await context.search.search({
      query: "fintech dashboard",
      limit: 50,
      maxTokens: 128,
    });
    expect(response.truncated).toBe(true);
    expect(response.returned).toBeLessThan(50);
    expect(estimateTokens(response)).toBeLessThanOrEqual(220);

    // Fallback metadata is trimmed before the last card is dropped.
    const fallback = await context.search.search({
      query: "automotive",
      limit: 50,
      maxTokens: 128,
    });
    expect(fallback.truncated).toBe(true);
    expect(fallback.familyFallback).toEqual([]);
    expect(estimateTokens(fallback)).toBeLessThanOrEqual(160);
  });

  it("returns useful hints when nothing matches", async () => {
    const response = await context.search.search({ query: "zzzzzz-not-a-thing", limit: 5 });
    expect(response.total).toBe(0);
    expect(response.results).toHaveLength(0);
    expect(response.hints.join(" ")).toMatch(/No catalog matches/);
    expect(response.hints.join(" ")).toMatch(/taste_get/);
  });

  it("suggests cards for a missing id", async () => {
    const suggestions = await context.search.suggest("fintech", 3);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.id).toBe("domain/fintech-payments");
  });
});
