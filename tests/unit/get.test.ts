import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../src/core/budget.js";
import type { DomainPack, ReferencePack } from "../../src/core/schema.js";
import { createTasteProContext } from "../../src/server/context.js";

const context = createTasteProContext();

interface BriefPack {
  id: string;
  kind: string;
  name: string;
  playbook?: { audience?: string[]; questions?: string[] };
  colors?: Record<string, unknown>;
  contrast?: Record<string, unknown>;
  body?: string;
  bodyTruncated?: boolean;
}

function firstPack(response: { packs: unknown[] }): BriefPack {
  return response.packs[0] as BriefPack;
}

describe("get service", () => {
  it("returns a domain playbook brief with the authored fields", async () => {
    const response = await context.get.get({ ids: "domain/fintech-payments" });
    expect(response.format).toBe("brief");
    expect(response.count).toBe(1);
    expect(response.missing).toEqual([]);
    const pack = firstPack(response) as BriefPack & {
      playbook: {
        audience: string[];
        jobs: string[];
        trust: string[];
        informationArchitecture: string[];
        conversion: string;
        contentChecklist: string[];
        antiPatterns: string[];
        signatureMoves: string[];
        recommendedDirections: string[];
        recommendedSections: string[];
        recommendedPalettes: string[];
        questions: string[];
        liveThing: string;
        notes: string;
      };
    };
    expect(pack.id).toBe("domain/fintech-payments");
    expect(pack.kind).toBe("domain");
    expect(pack.playbook.audience.length).toBeGreaterThan(2);
    expect(pack.playbook.jobs.length).toBeGreaterThan(2);
    expect(pack.playbook.trust.length).toBeGreaterThan(2);
    expect(pack.playbook.questions.length).toBeGreaterThan(2);
    expect(pack.playbook.recommendedDirections).toContain("quiet-instrument");
  });

  it("points taxonomy-only domains at same-family playbooks", async () => {
    const response = await context.get.get({ ids: "domain/automotive", format: "brief" });
    const pack = firstPack(response) as BriefPack & {
      questions: string[];
      familyFallback?: {
        family: string;
        note: string;
        playbooks: Array<{ id: string; name: string; summary: string }>;
      };
    };
    expect(pack.id).toBe("domain/automotive");
    expect(pack.playbook).toBeUndefined();
    expect(pack.questions.length).toBeGreaterThan(0);
    expect(pack.familyFallback?.family).toBe("commerce");
    expect(pack.familyFallback?.playbooks.map((item) => item.id)).toEqual([
      "domain/ecommerce-dtc",
      "domain/restaurants-food",
      "domain/travel-hospitality",
    ]);
    expect(pack.familyFallback?.note).toMatch(/No deep playbook/);
  });

  it("does not claim a fallback when the family has no playbook", async () => {
    const response = await context.get.get({ ids: "domain/energy-climate", format: "brief" });
    const pack = firstPack(response) as BriefPack & {
      familyFallback?: { family: string; note: string; playbooks: unknown[] };
    };
    expect(pack.familyFallback?.family).toBe("science");
    expect(pack.familyFallback?.playbooks).toEqual([]);
    expect(pack.familyFallback?.note).toMatch(/No deep playbook or same-family playbook/);
  });

  it("resolves bare suffixes and returns multiple packs", async () => {
    const response = await context.get.get({
      ids: ["fintech-payments", "direction/quiet-instrument"],
      format: "brief",
    });
    expect(response.count).toBe(2);
    expect(response.missing).toEqual([]);
    expect(response.packs.map((pack) => (pack as BriefPack).id)).toEqual([
      "domain/fintech-payments",
      "direction/quiet-instrument",
    ]);
  });

  it("returns suggestions and a missing list for unknown ids", async () => {
    const response = await context.get.get({
      ids: ["domain/fintech-paymnts", "not-a-real-pack"],
      format: "brief",
    });
    expect(response.count).toBe(0);
    expect(response.missing).toHaveLength(2);
    expect(response.suggestions?.length).toBeGreaterThan(0);
  });

  it("renders a direction as implementation-oriented Markdown", async () => {
    const response = await context.get.get({
      ids: "direction/quiet-instrument",
      format: "markdown",
    });
    expect(response.count).toBe(1);
    const markdown = String(response.packs[0]);
    expect(markdown).toContain("# The quiet instrument");
    expect(markdown).toContain("## Idea");
    expect(markdown).toContain("## Composition");
    expect(markdown).toContain("## Pitfalls");
    expect(markdown).toContain("## Seen in");
    expect(markdown).toContain("Quality: **verified**");
  });

  it("renders brand tokens and contrast warnings as Markdown", async () => {
    const response = await context.get.get({
      ids: "brand/stripe",
      format: "markdown",
    });
    const markdown = String(response.packs[0]);
    expect(markdown).toContain("# Stripe");
    expect(markdown).toContain("## Colors");
    expect(markdown).toContain("## Typography");
    expect(markdown).toContain("## Contrast");
    expect(markdown).toContain("do not impersonate the brand");
  });

  it("renders a domain playbook with recommendations and questions", async () => {
    const response = await context.get.get({
      ids: "domain/developer-tools",
      format: "markdown",
    });
    const markdown = String(response.packs[0]);
    expect(markdown).toContain("# Developer tools");
    expect(markdown).toContain("## Information architecture");
    expect(markdown).toContain("## Recommended directions");
    expect(markdown).toContain("`direction/product-performs`");
    expect(markdown).toContain("## Questions");
    expect(markdown).toContain("Status: **available**");
  });

  it("renders family fallback and questions for a taxonomy-only domain", async () => {
    const response = await context.get.get({
      ids: "domain/automotive",
      format: "markdown",
      maxTokens: 24_000,
    });
    const markdown = String(response.packs[0]);
    expect(markdown).toContain("# Automotive");
    expect(markdown).toContain("## Family fallback");
    expect(markdown).toContain("`domain/ecommerce-dtc`");
    expect(markdown).toContain("`domain/restaurants-food`");
    expect(markdown).toContain("## Questions");
    expect(markdown).toContain("Taxonomy-only domain");
  });

  it("returns full packs and raw JSON", async () => {
    const full = await context.get.get({
      ids: "palette/white-navy-tab",
      format: "full",
    });
    const pack = full.packs[0] as {
      id: string;
      provenance: { commit: string };
      contrast?: unknown;
    };
    expect(pack.id).toBe("palette/white-navy-tab");
    expect(pack.provenance.commit).toHaveLength(40);
    expect(pack.contrast).toBeTruthy();

    const json = await context.get.get({
      ids: "palette/white-navy-tab",
      format: "json",
    });
    expect(json.packs[0]).toEqual(pack);
  });

  it("excerpts reference bodies by default and includes them on request", async () => {
    const brief = await context.get.get({
      ids: "reference/taste-skill-skill",
      format: "brief",
    });
    const excerpt = firstPack(brief);
    expect(excerpt.body?.length).toBeLessThanOrEqual(1_201);
    expect(excerpt.bodyTruncated).toBe(true);

    const full = await context.get.get({
      ids: "reference/taste-skill-skill",
      format: "brief",
      includeBody: true,
    });
    const body = firstPack(full).body ?? "";
    expect(body.length).toBeGreaterThan(1_200);
    expect(body).toContain("#");
  });

  it("returns the full reference Markdown", async () => {
    const response = await context.get.get({
      ids: "reference/taste-skill-type",
      format: "markdown",
    });
    const markdown = String(response.packs[0]);
    expect(markdown.length).toBeGreaterThan(500);
    expect(markdown).toContain("type");
  });

  it("renders a guideline as a citation-ready Markdown block", async () => {
    const response = await context.get.get({
      ids: "guideline/accessibility-icon-only-buttons-need-aria-label",
      format: "markdown",
    });
    const markdown = String(response.packs[0]);
    expect(markdown).toContain("## Icon-only buttons need");
    expect(markdown).toContain("- **Category:** Accessibility");
    expect(markdown).toContain("- **Severity:** warn");
    expect(markdown).toContain("github.com/vercel-labs/web-interface-guidelines");
  });

  it("fits Markdown into the token budget", async () => {
    const response = await context.get.get({
      ids: "domain/developer-tools",
      format: "markdown",
      maxTokens: 128,
    });
    expect(response.truncated).toBe(true);
    expect(estimateTokens(String(response.packs[0]))).toBeLessThanOrEqual(128);
    expect(String(response.packs[0])).toContain("truncated");
  });

  it("fits JSON into the token budget without losing identity", async () => {
    const response = await context.get.get({
      ids: "domain/developer-tools",
      format: "brief",
      maxTokens: 200,
    });
    expect(response.truncated).toBe(true);
    expect(estimateTokens(response)).toBeLessThanOrEqual(200);
    const pack = firstPack(response) as { id: string; kind: string; playbook?: unknown };
    expect(pack.id).toBe("domain/developer-tools");
    expect(pack.kind).toBe("domain");
    expect(response.count).toBe(response.packs.length);

    const roomy = await context.get.get({
      ids: "domain/developer-tools",
      format: "brief",
      maxTokens: 2_400,
    });
    expect(roomy.truncated).toBe(false);
    expect((firstPack(roomy) as { playbook?: unknown }).playbook).toBeTruthy();
  });

  it("keeps a tight JSON budget honest at the minimum", async () => {
    const response = await context.get.get({
      ids: "direction/quiet-instrument",
      format: "brief",
      maxTokens: 128,
    });
    expect(response.truncated).toBe(true);
    expect(estimateTokens(response)).toBeLessThanOrEqual(128);
    expect(response.count).toBe(response.packs.length);
    const pack = firstPack(response) as {
      id: string;
      kind: string;
      name: string;
      provenance?: { commit?: string };
    };
    expect(pack.id).toBe("direction/quiet-instrument");
    expect(pack.kind).toBe("direction");
    expect(pack.name.length).toBeGreaterThan(0);
    if (pack.provenance?.commit) expect(pack.provenance.commit).toHaveLength(40);
  });

  it("never truncates provenance or source URLs to fit a brief", async () => {
    const response = await context.get.get({
      ids: "direction/quiet-instrument",
      format: "brief",
      maxTokens: 400,
    });
    expect(response.truncated).toBe(true);
    expect(estimateTokens(response)).toBeLessThanOrEqual(400);
    const pack = firstPack(response) as {
      sourceUrl?: string;
      provenance?: { commit?: string; repo?: string; license?: string };
    };
    expect(pack.provenance?.commit).toHaveLength(40);
    expect(pack.provenance?.repo).toMatch(/^https:\/\/github\.com\//);
    expect(pack.provenance?.license).toBe("MIT");
    expect(pack.sourceUrl).toMatch(/^https:\/\/github\.com\//);
  });

  it("renders a helpful missing-id document in Markdown mode", async () => {
    const response = await context.get.get({
      ids: "domain/nope",
      format: "markdown",
    });
    expect(response.count).toBe(0);
    const markdown = String(response.packs[0]);
    expect(markdown).toContain("# Content not found");
    expect(markdown).toContain("domain/nope");
    expect(markdown).toContain("taste_search");
  });

  it("does not mutate the loaded pack", async () => {
    const before = await context.loader.pack("domain/fintech-payments");
    await context.get.get({ ids: "domain/fintech-payments", format: "markdown", maxTokens: 128 });
    const after = await context.loader.pack("domain/fintech-payments");
    expect(after).toEqual(before);
    expect((before as DomainPack).playbook?.audience.length).toBeGreaterThan(0);
  });

  it("keeps reference packs intact when loading a body", async () => {
    const pack = (await context.loader.pack("reference/taste-skill-type")) as ReferencePack;
    expect(pack.kind).toBe("reference");
    expect(pack.body.length).toBeGreaterThan(0);
  });
});
