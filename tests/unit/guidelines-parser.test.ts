import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGuidelines } from "../../scripts/lib/guidelines.js";

const provenance = {
  source: "web-interface-guidelines" as const,
  repo: "https://github.com/vercel-labs/web-interface-guidelines",
  commit: "434b7f91364665f2f733b310ec54809bf8f37937",
  path: "command.md",
  license: "MIT",
  authors: ["Vercel Labs"],
  url: "https://vercel.com/design/guidelines",
  transformations: ["parsed markdown headings and bullets"],
};

const sample = `---
description: Review UI code
---

## Rules

### Accessibility

- Icon-only buttons need \`aria-label\`
- Images need \`alt\` (or \`alt=""\` if decorative)

### Animation

- Honor \`prefers-reduced-motion\` (provide reduced variant or disable)
- Never \`transition: all\`—list properties explicitly

### Anti-patterns (flag these)

- \`outline-none\` without focus-visible replacement
- Inline \`onClick\` navigation without \`<a>\`
`;

describe("guideline parser", () => {
  it("parses categories, bullets, ids, and line numbers", () => {
    const rules = parseGuidelines(sample, provenance);
    expect(rules).toHaveLength(6);
    expect(rules[0]).toMatchObject({
      id: "guideline/accessibility-icon-only-buttons-need-aria-label",
      kind: "guideline",
      category: "Accessibility",
      text: "Icon-only buttons need `aria-label`",
      severity: "warn",
      line: 9,
    });
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
  });

  it("marks anti-patterns and never-rules as errors", () => {
    const rules = parseGuidelines(sample, provenance);
    const animation = rules.find((rule) => rule.text.includes("transition: all"));
    const anti = rules.find((rule) => rule.text.includes("outline-none"));
    expect(animation?.severity).toBe("error");
    expect(anti?.severity).toBe("error");
    expect(anti?.category).toBe("Anti-patterns (flag these)");
  });

  it("extracts an explicit replacement from an arrow", () => {
    const rules = parseGuidelines(
      "### Copy\n\n- Say “Loading…” → Use an ellipsis, not three periods\n",
      provenance,
    );
    expect(rules[0]?.instead).toBe("Use an ellipsis, not three periods");
    expect(rules[0]?.text).toBe("Say “Loading…” → Use an ellipsis, not three periods");
  });

  it("parses the pinned upstream command.md", () => {
    const markdown = readFileSync(
      new URL("../../tests/fixtures/upstream/web-guidelines/command.md", import.meta.url),
      "utf8",
    );
    const rules = parseGuidelines(markdown, provenance);
    expect(rules.length).toBeGreaterThanOrEqual(100);
    expect(rules.every((rule) => rule.id.startsWith("guideline/"))).toBe(true);
    expect(rules.every((rule) => rule.summary.length > 0)).toBe(true);
    expect(rules.filter((rule) => rule.category === "Accessibility").length).toBeGreaterThan(5);
  });
});
