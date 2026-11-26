import { describe, expect, it } from "vitest";
import { parseAntPage } from "../../scripts/lib/sources/antd.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "ant-design",
  repo: "https://github.com/ant-design/ant-design",
  commit: "768405c1019435763adab015d47bf503505340d6",
  path: "docs/spec/data-display.en-US.md",
  license: "MIT",
  authors: ["Ant Group"],
  url: "https://ant.design/docs/spec/introduce",
  transformations: ["removed ImagePreview blocks, images, and link markup"],
};

const markdown = `---
group: Design Patterns
type: Global Rules
order: 4
title: Data Display
---

The suitable way to display data helps users quickly locate and browse data, and work together more efficiently. Organize the order of presentations according to the importance of the information, the frequency of operation, and the degree of association.

## Table

<ImagePreview>
  <img class="preview-img" src="https://example.com/table.png">
</ImagePreview>

The table is one of the clearest and most efficient forms of presenting data. It is often used with sorting, searching, filtering, and paging, and is suitable for information collection, data analysis, and manipulating structured data.

> Note: Keep time, status, and action-bar words intact without occupying multiple lines. When a cell is empty, use a dash to indicate there is no data.

## Card

A card is a container for carrying information. Cards are usually arranged in a grid or matrix to convey the hierarchical relationship between each other. They are suitable for lighter and more personalized information blocks.
`;

describe("Ant Design parser", () => {
  it("keeps the spec guidance and strips ImagePreview and images", () => {
    const pack = parseAntPage(markdown, provenance, "https://ant.design/docs/spec/data-display", {
      slug: "data-display",
      kinds: ["data-display", "tables"],
      domains: ["b2b-saas"],
    });

    expect(pack.id).toBe("app-pattern/ant-data-display");
    expect(pack.name).toBe("Data Display");
    expect(pack.blueprint).toContain("Table");
    expect(pack.blueprint).toContain("Card");
    expect(pack.blueprint).not.toContain("ImagePreview");
    expect(pack.blueprint).not.toContain("example.com/table.png");
    expect(pack.provenance.license).toBe("MIT");
  });
});
