import { describe, expect, it } from "vitest";
import { parsePatternFlyPage } from "../../scripts/lib/sources/patternfly.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "patternfly",
  repo: "https://github.com/patternfly/patternfly-org",
  commit: "7637a02a651895ca568938e71621ecc717224e44",
  path: "packages/documentation-site/patternfly-docs/content/patterns/dashboard/dashboard.md",
  license: "MIT",
  authors: ["Red Hat"],
  url: "https://www.patternfly.org/",
  transformations: ["removed images and link markup"],
};

const markdown = `---
id: Dashboard
section: patterns
---

A dashboard provides overviews of key metrics or performance indicators relevant to an application, process, or business. The overall experience of dashboards can vary greatly depending on their use cases, so it can be difficult to define a one-size-fits-all approach.

## Elements

Dashboards can typically be distilled into two main parts:

- **Cards:** Information is communicated via cards. Each card should convey a single metric or a group of closely related metrics.
- **Layout:** The arrangement of cards, typically in a grid structure.

<img src="./img/dashboard-view-desktop.png" alt="example of a dashboard" />

## Standard cards

Aggregate status cards show a total number of objects and an aggregated status for them. They can provide a quick count of the number of nodes making up a large distributed network and identify the numbers that are down or need maintenance.

Trend cards display the change in a metric over time. The current value and prior values should be visible over a given time period. Use a sparkline chart to show the trend.
`;

describe("PatternFly parser", () => {
  it("keeps dashboard guidance and strips images", () => {
    const pack = parsePatternFlyPage(
      markdown,
      provenance,
      "https://www.patternfly.org/patterns/dashboard/",
      {
        slug: "dashboard",
        path: "packages/documentation-site/patternfly-docs/content/patterns/dashboard/dashboard.md",
        url: "https://www.patternfly.org/patterns/dashboard/",
        kinds: ["pattern", "dashboard"],
        domains: ["b2b-saas"],
        basis: "dashboard pattern from PatternFly",
      },
    );

    expect(pack.id).toBe("app-pattern/patternfly-dashboard");
    expect(pack.name).toBe("Dashboard");
    expect(pack.blueprint).toContain("single metric");
    expect(pack.blueprint).toContain("Aggregate status cards");
    expect(pack.blueprint).not.toContain("dashboard-view-desktop.png");
    expect(pack.provenance.license).toBe("MIT");
  });
});
