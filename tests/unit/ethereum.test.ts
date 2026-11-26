import { describe, expect, it } from "vitest";
import { parseEthereumPage } from "../../scripts/lib/sources/ethereum.js";
import type { Provenance } from "../../src/core/schema.js";

const provenance: Provenance = {
  source: "ethereum-org",
  repo: "https://github.com/ethereum/ethereum-org-website",
  commit: "4302e8c0a8e51d161c124e8c57d8d93da2995da1",
  path: "public/content/developers/docs/design-and-ux/heuristics-for-web3/index.md",
  license: "CC-BY-4.0",
  authors: ["Ethereum Foundation"],
  url: "https://ethereum.org/en/developers/docs/design-and-ux/",
  transformations: ["removed images and link markup"],
};

const markdown = `---
title: 7 heuristics for Web3 interface design
description: Principles to improve the usability of Web3
lang: en
---

Usability heuristics are broad rules of thumb that you can use to measure the usability of your site.

## Seven usability heuristics for web3

1. Feedback follows action
2. Security and trust

## Definitions and examples

### 1. Feedback follows action

**It should be obvious when something has happened, or is happening.**

Users decide on their next steps based on the outcome of their previous steps. Therefore it is essential that they remain informed about the system status.

**Tips:**

- Inform the user via messaging, notifications, and other alerts.
- Communicate waiting times clearly.

![Informing the user about each step](./Image1.png)

See [Nielsen's heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
`;

describe("ethereum.org parser", () => {
  it("keeps web3 guidance and strips images and link markup", () => {
    const pack = parseEthereumPage(
      markdown,
      provenance,
      "https://ethereum.org/en/developers/docs/design-and-ux/heuristics-for-web3/",
      {
        slug: "heuristics-for-web3",
        path: "public/content/developers/docs/design-and-ux/heuristics-for-web3/index.md",
        url: "https://ethereum.org/en/developers/docs/design-and-ux/heuristics-for-web3/",
        kinds: ["web3", "heuristics"],
        basis: "seven Web3 usability heuristics from ethereum.org",
      },
    );

    expect(pack.id).toBe("app-pattern/ethereum-heuristics-for-web3");
    expect(pack.name).toBe("7 heuristics for Web3 interface design");
    expect(pack.summary).toContain("usability of Web3");
    expect(pack.blueprint).toContain("Feedback follows action");
    expect(pack.blueprint).not.toContain("Image1.png");
    expect(pack.blueprint).not.toContain("](https://");
    expect(pack.provenance.license).toBe("CC-BY-4.0");
  });
});
