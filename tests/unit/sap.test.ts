import { describe, expect, it } from "vitest";
import { parseSapComponent } from "../../scripts/lib/sources/sap.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "sap",
  repo: "https://github.com/SAP/fundamental-styles",
  commit: "0753390b563b4eafe4d90ec812205df1361941ac",
  path: "docs/component-guidance.json",
  license: "Apache-2.0",
  authors: ["SAP"],
  url: "https://sap.github.io/fundamental-styles/",
  transformations: ["selected description, whenToUse, whenToAvoid, and bestPractices"],
};

describe("SAP parser", () => {
  it("turns structured guidance into an app pattern", () => {
    const pack = parseSapComponent(
      "button",
      {
        name: "Button",
        category: "Actions & Controls",
        description:
          "Buttons enable users to trigger actions in applications, from submitting data to opening menus or toggling views.",
        whenToUse: [
          "Trigger specific actions such as Create, Edit, Save, Approve, Reject, Accept, or Cancel",
          "Use toggle buttons in a toolbar to activate or deactivate an element",
        ],
        whenToAvoid: [
          "Linking to a different page or object — use a link instead",
          "Displaying general navigation functions — use home or breadcrumbs instead",
        ],
        bestPractices: [
          "Use the default button for neutral or secondary actions",
          "Use one emphasized button per page or dialog for the primary action",
          "Always include descriptive text or an aria-label for icon-only buttons",
        ],
      },
      provenance,
    );

    expect(pack.id).toBe("app-pattern/sap-button");
    expect(pack.name).toBe("Button");
    expect(pack.blueprint).toContain("### When to use");
    expect(pack.blueprint).toContain("### When to avoid");
    expect(pack.blueprint).toContain("### Best practices");
    expect(pack.blueprint).toContain("one emphasized button");
    expect(pack.provenance.license).toBe("Apache-2.0");
  });
});
