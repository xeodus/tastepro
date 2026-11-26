import { describe, expect, it } from "vitest";
import { parseUswdsPattern, uswdsUrl } from "../../scripts/lib/sources/uswds.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "uswds",
  repo: "https://github.com/uswds/uswds-site",
  commit: "af13d80f071c3d897bee422f51954d9d7d156474",
  path: "pages/patterns/create-a-profile/name.md",
  license: "CC0-1.0",
  authors: ["U.S. General Services Administration"],
  url: "https://designsystem.digital.gov/",
  transformations: ["converted HTML guidance to text"],
};

const markdown = `---
title: Name
lead: The name pattern makes it easy for users to enter their name.
permalink: /patterns/create-a-user-profile/name/
---

## About this pattern

### What problem does this solve?

<p>People have a wide variety of names in various formats. It can be confusing and alienating for them to enter their name if it does not conform to the form fields provided, or if the form fields do not support the characters, length, or language they require.</p>

<p>At the same time, the name fields are often used as a primary form of identity validation, so the agency and privacy issues require the information be entered in a specific and consistent way.</p>

### When to use this pattern

<p>Follow this pattern when you need to ask for a user’s name as part of your service. Only ask for a name if you need it.</p>

<div class="do-dont">
  <h3>What to do</h3>
  <ul>
    <li>Do support long text fields for each name.</li>
    <li>Do support names as short as a single character.</li>
    <li>Do allow both upper- and lowercase letters throughout each field.</li>
    <li>Do allow hyphens, apostrophes, and blank spaces in each name field.</li>
  </ul>
</div>

<div class="usa-accordion">
  <h3>Pattern preview</h3>
  <p>This example should be removed.</p>
</div>
`;

describe("USWDS parser", () => {
  it("turns pattern guidance into an app pattern and strips previews", () => {
    const pack = parseUswdsPattern(
      markdown,
      provenance,
      "https://designsystem.digital.gov/patterns/create-a-user-profile/name/",
      {
        slug: "name",
        path: "pages/patterns/create-a-profile/name.md",
        kinds: ["form", "identity"],
        domains: ["government-public"],
        sectors: ["government"],
      },
    );

    expect(pack.id).toBe("app-pattern/uswds-name");
    expect(pack.name).toBe("Name");
    expect(pack.summary).toContain("name pattern");
    expect(pack.blueprint).toContain("long text fields");
    expect(pack.blueprint).toContain("single character");
    expect(pack.blueprint).not.toContain("Pattern preview");
    expect(pack.blueprint).not.toContain("should be removed");
    expect(pack.provenance.license).toBe("CC0-1.0");
  });

  it("builds the public USWDS URL from the permalink", () => {
    expect(uswdsUrl("/patterns/create-a-user-profile/name/")).toBe(
      "https://designsystem.digital.gov/patterns/create-a-user-profile/name/",
    );
  });
});
