import { describe, expect, it } from "vitest";
import { parseCarbonPage } from "../../scripts/lib/sources/carbon.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "carbon",
  repo: "https://github.com/carbon-design-system/carbon-website",
  commit: "5e9cd1da43c32d3d3b991dc947b427f674da61a8",
  path: "src/pages/components/tabs/usage.mdx",
  license: "Apache-2.0",
  authors: ["IBM"],
  url: "https://carbondesignsystem.com/",
  transformations: ["removed MDX imports, examples, images, and layout wrappers"],
};

const markdown = `---
title: Tabs
description: Use tabs to navigate between views within the same context.
---

import { Tabs } from '@carbon/react';

<PageDescription>

Tabs organize related content and let users move between groups without leaving the page.

</PageDescription>

<AnchorLinks>
<AnchorLink>Overview</AnchorLink>
</AnchorLinks>

## Live demo

<StorybookDemo url="https://react.carbondesignsystem.com" variants={[{ label: 'Default' }]} />

## Overview

Tabs are used to group different but related content, allowing users to navigate views without leaving the page.

### When to use

- Use tabs to reduce cognitive load.
- Use tabs when the content belongs to the same context.

### Content

Use clear, concise labels for each tab. Labels should describe the content inside the tab, not the action the user is taking. Keep labels short enough to scan, and avoid jargon or internal terminology.

- Use sentence case for tab labels.
- Put the most important tab first.
- Do not use tabs for sequential steps; use a progress indicator instead.
- Explain what happens next when a tab contains a form or a destructive action.

<Row>
<Column colLg={12}>

![An example of tabs](images/tab-usage-1.png)

</Column>
</Row>
`;

describe("Carbon parser", () => {
  it("keeps guidance and strips MDX examples, images, and wrappers", () => {
    const pack = parseCarbonPage(
      markdown,
      provenance,
      "https://carbondesignsystem.com/components/tabs/usage/",
      {
        slug: "tabs",
        path: "src/pages/components/tabs/usage.mdx",
        url: "https://carbondesignsystem.com/components/tabs/usage/",
        kinds: ["component", "usage"],
        domains: ["b2b-saas"],
        basis: "component usage pattern from IBM Carbon",
      },
    );

    expect(pack.id).toBe("app-pattern/carbon-tabs");
    expect(pack.name).toBe("Tabs");
    expect(pack.summary).toContain("navigate between views");
    expect(pack.blueprint).toContain("reduce cognitive load");
    expect(pack.blueprint).not.toContain("StorybookDemo");
    expect(pack.blueprint).not.toContain("tab-usage-1.png");
    expect(pack.blueprint).not.toContain("AnchorLink");
    expect(pack.provenance.license).toBe("Apache-2.0");
  });
});
