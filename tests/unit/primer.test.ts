import { describe, expect, it } from "vitest";
import { parsePrimerPage } from "../../scripts/lib/sources/primer.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "primer",
  repo: "https://github.com/primer/design",
  commit: "87f799f202ec95df15c99f473c9c0c803da8e6b3",
  path: "content/ui-patterns/empty-states.mdx",
  license: "MIT",
  authors: ["GitHub"],
  url: "https://primer.style/",
  transformations: ["removed images and link markup"],
};

const markdown = `---
title: Empty states
description: Empty states fill spaces when no content has been added yet, or are temporarily empty.
---

These guidelines demonstrate best practices for using the Blankslate component and designing empty states.

## The Blankslate component

The Blankslate is made up of several elements that work together to inform the user about a feature and how to proceed forward.

![Blankslate anatomy](https://example.com/anatomy.png)

### Graphic

The graphic can bring delight, preview an interface element, or represent the goal of the feature. Graphics should be placed intentionally. If a Blankslate conveys an error state, the graphic should reinforce that something went wrong instead of being playful.

### Primary text

Primary text acts as a title for the empty space. Use it to explain the purpose of the empty state, help users feel comfortable engaging with the content, or concisely summarize an error state. If the space is empty because the feature has not been used yet, convey the intention of the feature in a welcoming and human way.
`;

describe("Primer parser", () => {
  it("keeps empty-state guidance and strips images", () => {
    const pack = parsePrimerPage(
      markdown,
      provenance,
      "https://primer.style/ui-patterns/empty-states/",
      {
        slug: "empty-states",
        path: "content/ui-patterns/empty-states.mdx",
        url: "https://primer.style/ui-patterns/empty-states/",
        kinds: ["empty-state", "states"],
        domains: ["developer-tools"],
        basis: "empty states guidance from GitHub Primer",
      },
    );

    expect(pack.id).toBe("app-pattern/primer-empty-states");
    expect(pack.name).toBe("Empty states");
    expect(pack.blueprint).toContain("Blankslate");
    expect(pack.blueprint).toContain("Primary text");
    expect(pack.blueprint).not.toContain("anatomy.png");
    expect(pack.provenance.license).toBe("MIT");
  });
});
