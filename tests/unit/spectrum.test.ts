import { describe, expect, it } from "vitest";
import { parseSpectrumEntry } from "../../scripts/lib/sources/spectrum.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "spectrum",
  repo: "https://github.com/adobe/spectrum-design-data",
  commit: "1818e9c1035fd38f361a0698fb3453477b702552",
  path: "packages/design-data/components/button.json",
  license: "Apache-2.0",
  authors: ["Adobe"],
  url: "https://spectrum.adobe.com/",
  transformations: ["flattened Spectrum documentBlocks into guidance text"],
};

describe("Spectrum parser", () => {
  it("flattens component document blocks into guidance", () => {
    const pack = parseSpectrumEntry(
      {
        name: "button",
        displayName: "Button",
        description: "Buttons allow users to perform an action or navigate to another page.",
        meta: { category: "actions", documentationUrl: "https://spectrum.adobe.com/page/button/" },
        documentBlocks: [
          { type: "purpose", content: "Buttons allow users to perform an action." },
          {
            type: "guideline",
            content: "Keyboard focus. A button can be navigated using a keyboard.",
          },
          {
            type: "guideline",
            content: "Flexible width. The width adjusts to fit the label text.",
          },
          {
            type: "guideline",
            content:
              "Buttons use the default arrow cursor in every state, except on the web when the button uses an href and displays the pointer cursor instead.",
          },
        ],
      },
      provenance,
      "https://spectrum.adobe.com/page/button/",
      {
        slug: "button",
        path: "packages/design-data/components/button.json",
        kinds: ["component", "usage"],
        basis: "component guidance from Adobe Spectrum",
      },
    );

    expect(pack.id).toBe("app-pattern/spectrum-button");
    expect(pack.name).toBe("Button");
    expect(pack.summary).toContain("perform an action");
    expect(pack.blueprint).toContain("Keyboard focus");
    expect(pack.blueprint).toContain("Flexible width");
    expect(pack.sourceUrl).toBe("https://spectrum.adobe.com/page/button/");
    expect(pack.provenance.license).toBe("Apache-2.0");
  });

  it("flattens foundation guidelines with their own title", () => {
    const pack = parseSpectrumEntry(
      {
        name: "attention-hierarchy",
        title: "Attention hierarchy",
        category: "designing",
        sourceUrl: "https://spectrum.adobe.com/page/attention-hierarchy/",
        documentBlocks: [
          { type: "purpose", content: "Attention hierarchy" },
          {
            type: "guideline",
            content:
              "High attention elements should be used sparingly. If too many things are high attention at once, the experience becomes noisy and unfocused.",
          },
          {
            type: "guideline",
            content:
              "Attention hierarchy is a core concept in Spectrum 2. It extends typographic hierarchy beyond text and into all the ways the interface communicates meaning, so people can recognize what is most important.",
          },
        ],
      },
      provenance,
      "https://spectrum.adobe.com/page/attention-hierarchy/",
      {
        slug: "attention-hierarchy",
        path: "packages/design-data/guidelines/attention-hierarchy.json",
        kinds: ["guideline", "foundation"],
        basis: "foundation guidance from Adobe Spectrum",
      },
    );

    expect(pack.id).toBe("app-pattern/spectrum-attention-hierarchy");
    expect(pack.name).toBe("Attention hierarchy");
    expect(pack.blueprint).toContain("used sparingly");
    expect(pack.kinds).toContain("foundation");
  });
});
