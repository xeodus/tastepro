import { describe, expect, it } from "vitest";
import { govukUrl, parseGovukPattern } from "../../scripts/lib/sources/govuk.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "govuk-design-system",
  repo: "https://github.com/alphagov/govuk-design-system",
  commit: "0c6de5736a4e755a3808fb31d3a7723a33b7c705",
  path: "src/patterns/bank-details/index.md",
  license: "OGL-3.0",
  authors: ["Government Digital Service"],
  url: "https://design-system.service.gov.uk/",
  transformations: ["stripped Nunjucks, images, and links"],
};

const markdown = `---
title: Bank details
description: How to ask users for their bank details
section: Patterns
---

{% from "_example.njk" import example %}

{{ example({ group: "patterns", item: "bank-details" }) }}

## When to use this pattern

Follow this pattern if you need users to provide their bank details so you can pay them.

![A screenshot](bank-details.png)

## How it works

### Allow different formats for the sort code

Let users enter their sort code in whatever format is familiar to them.

### Asking for building society roll numbers

Roll numbers are only used by some building societies.
`;

describe("GOV.UK parser", () => {
  it("turns guidance into an app pattern and strips examples and images", () => {
    const pack = parseGovukPattern(
      markdown,
      provenance,
      "https://design-system.service.gov.uk/patterns/bank-details/",
      {
        slug: "bank-details",
        path: "src/patterns/bank-details/index.md",
        kinds: ["form", "payments"],
        domains: ["fintech-payments", "government-public"],
        sectors: ["government", "finance"],
      },
    );

    expect(pack.id).toBe("app-pattern/govuk-bank-details");
    expect(pack.kind).toBe("app-pattern");
    expect(pack.name).toBe("Bank details");
    expect(pack.summary).toBe("How to ask users for their bank details");
    expect(pack.blueprint).toContain("sort code");
    expect(pack.blueprint).toContain("roll numbers");
    expect(pack.blueprint).not.toContain("{{");
    expect(pack.blueprint).not.toContain("{%");
    expect(pack.blueprint).not.toContain("bank-details.png");
    expect(pack.blueprint).not.toContain("[A screenshot]");
    expect(pack.domains).toContain("fintech-payments");
    expect(pack.provenance.license).toBe("OGL-3.0");
  });

  it("builds the public GOV.UK URL from the repo path", () => {
    expect(govukUrl("src/patterns/bank-details/index.md")).toBe(
      "https://design-system.service.gov.uk/patterns/bank-details/",
    );
    expect(govukUrl("src/components/error-summary/index.md")).toBe(
      "https://design-system.service.gov.uk/components/error-summary/",
    );
  });

  it("rejects a file with too little guidance", () => {
    expect(() =>
      parseGovukPattern("---\ntitle: Empty\n---\nToo short.", provenance, "https://example.com", {
        slug: "empty",
        path: "src/patterns/empty/index.md",
        kinds: ["form"],
        domains: ["government-public"],
        sectors: ["government"],
      }),
    ).toThrow(/too little guidance/);
  });
});
