import { describe, expect, it } from "vitest";
import { nhsUrl, parseNhsPattern } from "../../scripts/lib/sources/nhs.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "nhs-uk",
  repo: "https://github.com/nhsuk/nhsuk-service-manual",
  commit: "4a37578c4d8fa2c5bbf11b1039d806bebce59234",
  path: "app/views/design-system/patterns/ask-for-nhs-numbers/index.njk",
  license: "OGL-3.0",
  authors: ["NHS England"],
  url: "https://service-manual.nhs.uk/design-system",
  transformations: ["removed Nunjucks template tags and design examples"],
};

const source = `{% extends "layouts/app-layout.njk" %}

{% set pageTitle = "NHS numbers" %}
{% set pageDescription = "Use this pattern to ask people for their NHS number and help them find it." %}

{% block bodyContent %}

  <h2>When to use the NHS number pattern</h2>
  <p>Follow this pattern when you need to ask for an NHS number.</p>
  <p>Weigh up user and business needs and clinical risk in deciding whether to ask users for their NHS number. Asking users for their NHS number is the best way to identify a patient and minimise the risks of matching the wrong person.</p>
  <ul>
    <li>users do not need to know their NHS number to get care</li>
    <li>some users do not know their number and cannot find it easily</li>
  </ul>

  {{ designExample({
    group: "patterns",
    item: "ask-for-nhs-numbers",
    type: "default"
  }) }}

  <h3>Single text input</h3>
  <p>Use a single text input if the only way users can get the service is by entering their NHS number.</p>

{% endblock %}
`;

describe("NHS parser", () => {
  it("keeps the guidance and strips Nunjucks and design examples", () => {
    const pack = parseNhsPattern(source, provenance, nhsUrl("ask-for-nhs-numbers"), {
      slug: "ask-for-nhs-numbers",
      path: "app/views/design-system/patterns/ask-for-nhs-numbers/index.njk",
      kinds: ["form", "identity"],
      domains: ["healthcare-wellness"],
      sectors: ["healthcare"],
    });

    expect(pack.id).toBe("app-pattern/nhs-ask-for-nhs-numbers");
    expect(pack.name).toBe("NHS numbers");
    expect(pack.summary).toContain("ask people for their NHS number");
    expect(pack.blueprint).toContain("clinical risk");
    expect(pack.blueprint).toContain("Single text input");
    expect(pack.blueprint).not.toContain("{%");
    expect(pack.blueprint).not.toContain("designExample");
    expect(pack.provenance.license).toBe("OGL-3.0");
  });

  it("builds the public NHS URL", () => {
    expect(nhsUrl("ask-for-nhs-numbers")).toBe(
      "https://service-manual.nhs.uk/design-system/patterns/ask-for-nhs-numbers",
    );
  });
});
