import { describe, expect, it } from "vitest";
import { parsePiePattern } from "../../scripts/lib/sources/pie.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "pie",
  repo: "https://github.com/justeattakeaway/pie",
  commit: "cf7021732ad8ded4c818e95205d15b601d80fe50",
  path: "apps/pie-docs/src/patterns/onboarding-and-guided-tour/overview/overview.md",
  license: "Apache-2.0",
  authors: ["Just Eat Takeaway.com"],
  url: "https://pie.design/",
  transformations: ["removed Nunjucks includes, images, and link markup"],
};

const markdown = `---
title: Onboarding and Guided Tour
---

## Overview

Onboarding and guided tour patterns are essential tools for welcoming new users to a product or introducing existing users to new features. A good onboarding experience sets expectations, explains the value of the product, and helps people reach their first successful outcome without feeling overwhelmed.

{% contentPageImage {
    src: "../../../assets/img/patterns/onboarding/overview.svg",
    alt: "An onboarding screen"
} %}

## Guidance

- Introduce the product in plain language.
- Show progress when onboarding has multiple steps.
- Let users skip or return later.
- Use a guided tour only when the interface is complex enough to need it.
- Keep the tour short and focused on the first meaningful action.
`;

describe("PIE parser", () => {
  it("keeps guidance and strips Nunjucks and images", () => {
    const pack = parsePiePattern(
      markdown,
      provenance,
      "https://pie.design/patterns/onboarding-and-guided-tour/",
      {
        slug: "onboarding-and-guided-tour",
        title: "Onboarding and guided tour",
        paths: [],
        kinds: ["onboarding", "guidance"],
        domains: ["restaurants-food"],
        sectors: ["food-delivery"],
      },
    );

    expect(pack.id).toBe("app-pattern/pie-onboarding-and-guided-tour");
    expect(pack.name).toBe("Onboarding and guided tour");
    expect(pack.blueprint).toContain("welcoming new users");
    expect(pack.blueprint).toContain("Let users skip");
    expect(pack.blueprint).not.toContain("contentPageImage");
    expect(pack.blueprint).not.toContain("overview.svg");
    expect(pack.provenance.license).toBe("Apache-2.0");
  });
});
