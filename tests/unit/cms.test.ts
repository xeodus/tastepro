import { describe, expect, it } from "vitest";
import { cmsUrl, parseCmsPattern } from "../../scripts/lib/sources/cms.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "cms-design-system",
  repo: "https://github.com/CMSgov/design-system",
  commit: "269a1abeb3159824800e134064db8a7b35821ccd",
  path: "packages/docs/content/components/alert.mdx",
  license: "CC0-1.0",
  authors: ["Centers for Medicare & Medicaid Services"],
  url: "https://design.cms.gov/",
  transformations: ["removed MDX imports, examples, and JSX wrappers"],
};

const markdown = `---
title: Alert
intro: Alerts give feedback to users and provide critical information.
---

import { Alert } from '@cmsgov/design-system';

## Examples

<StorybookExample componentName="alert" storyId="components-alert--default" />

## Guidance

### When to use

Alerts give feedback to users, provide critical information, and offer key supplementary details about a task.

### Informational

The informational alert provides supplementary information or highlights a tool or step available to the user.

- Use informational alerts for non-critical or optional messaging.
- Use error alerts to block users from proceeding until they resolve the issue.

<EmbeddedExample>
  <p>This example should be removed.</p>
</EmbeddedExample>
`;

describe("CMS parser", () => {
  it("keeps the guidance section and strips MDX examples", () => {
    const pack = parseCmsPattern(markdown, provenance, "https://design.cms.gov/components/alert/", {
      slug: "alert",
      path: "packages/docs/content/components/alert.mdx",
      kinds: ["feedback"],
      domains: ["government-public"],
      sectors: ["government"],
    });

    expect(pack.id).toBe("app-pattern/cms-alert");
    expect(pack.name).toBe("Alert");
    expect(pack.summary).toContain("Alerts give feedback");
    expect(pack.blueprint).toContain("supplementary information");
    expect(pack.blueprint).toContain("error alerts");
    expect(pack.blueprint).not.toContain("StorybookExample");
    expect(pack.blueprint).not.toContain("should be removed");
    expect(pack.provenance.license).toBe("CC0-1.0");
  });

  it("builds the public CMS URL from the repo path", () => {
    expect(cmsUrl("packages/docs/content/components/alert.mdx")).toBe(
      "https://design.cms.gov/components/alert/",
    );
    expect(cmsUrl("packages/docs/content/patterns/zip-codes.mdx")).toBe(
      "https://design.cms.gov/patterns/zip-codes/",
    );
  });
});
