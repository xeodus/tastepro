import { describe, expect, it } from "vitest";
import {
  asArray,
  extractHeadings,
  firstParagraph,
  firstSentence,
  normalizeWhitespace,
  searchTerms,
  slugify,
  stemTerm,
  stripMarkdown,
  summarize,
  truncateAtWord,
  uniqueStrings,
} from "../../src/core/text.js";

describe("text utilities", () => {
  it("normalizes whitespace without touching single spaces", () => {
    expect(normalizeWhitespace("  a\n\t b  ")).toBe("a b");
  });

  it("strips common markdown while keeping link labels", () => {
    expect(stripMarkdown("# Heading\n\nA [link](https://example.com) and `code`.\n\n- item")).toBe(
      "Heading A link and code. item",
    );
  });

  it("extracts the first sentence without cutting abbreviations too eagerly", () => {
    expect(firstSentence("The name is the headline. Everything else waits.")).toBe(
      "The name is the headline.",
    );
    expect(firstSentence("One idea, no full stop, but a long tail", 20)).toMatch(/…$/);
  });

  it("summarizes long prose at a word boundary", () => {
    const summary = summarize("alpha beta gamma delta epsilon zeta eta theta", 18);
    expect(summary.length).toBeLessThanOrEqual(18);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary).not.toContain("  ");
  });

  it("truncates at a word boundary when possible", () => {
    expect(truncateAtWord("one two three four", 12)).toBe("one two…");
    expect(truncateAtWord("short", 12)).toBe("short");
  });

  it("creates stable slugs for ids", () => {
    expect(slugify("The name as a monument")).toBe("the-name-as-a-monument");
    expect(slugify("R&B / 1996")).toBe("r-and-b-1996");
    expect(slugify("  --Hello, World!--  ")).toBe("hello-world");
  });

  it("deduplicates strings case-insensitively", () => {
    expect(uniqueStrings(["A", "a", "B", " A "])).toEqual(["A", "B"]);
  });

  it("coerces arrays safely", () => {
    expect(asArray("one")).toEqual(["one"]);
    expect(asArray(["one", 2, null])).toEqual(["one", "2"]);
    expect(asArray(undefined)).toEqual([]);
  });

  it("extracts headings and the first real paragraph", () => {
    const markdown = "---\ntitle: x\n---\n\n# One\n\n## Two\n\nFirst paragraph.\n\nSecond.";
    expect(extractHeadings(markdown)).toEqual(["One", "Two"]);
    expect(firstParagraph(markdown)).toBe("First paragraph.");
  });

  it("removes stopwords from search terms", () => {
    expect(searchTerms("A design for the modern dashboard")).toEqual([
      "design",
      "modern",
      "dashboard",
    ]);
  });

  it("stems common plurals without mangling ss words", () => {
    expect(stemTerm("dashboards")).toBe("dashboard");
    expect(stemTerm("palettes")).toBe("palette");
    expect(stemTerm("stories")).toBe("story");
    expect(stemTerm("glass")).toBe("glass");
  });
});
