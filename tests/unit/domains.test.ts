import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APP_KIND_DOMAIN_MAP,
  BRAND_CATEGORY_DOMAIN_MAP,
  mapAppKinds,
  mapBrandCategory,
  mapSector,
  mapSectors,
  SECTOR_DOMAIN_MAP,
} from "../../scripts/lib/domains.js";

const taxonomy = JSON.parse(
  readFileSync(new URL("../../content/taxonomy/domains.json", import.meta.url), "utf8"),
) as Array<{ id: string }>;
const domainIds = new Set(taxonomy.map((domain) => domain.id));

describe("domain mappings", () => {
  it("maps upstream sectors to canonical domains", () => {
    expect(mapSector("finance")).toEqual(["fintech-payments"]);
    expect(mapSector("dev-tool")).toEqual(["developer-tools"]);
    expect(mapSector("personal-portfolio")).toEqual(["portfolios"]);
    expect(mapSector("other")).toEqual([]);
    expect(mapSector("unknown-sector")).toEqual([]);
  });

  it("deduplicates mapped sectors", () => {
    expect(mapSectors(["finance", "finance", "saas", "other"])).toEqual([
      "fintech-payments",
      "b2b-saas",
    ]);
  });

  it("maps app kinds and brand categories", () => {
    expect(mapAppKinds(["finance", "wallet", "unknown"])).toEqual([
      "fintech-payments",
      "crypto-web3",
    ]);
    expect(mapBrandCategory("Fintech & Crypto")).toEqual(["fintech-payments", "crypto-web3"]);
    expect(mapBrandCategory("Unknown")).toEqual([]);
  });

  it("only maps to canonical taxonomy ids", () => {
    for (const [key, domains] of Object.entries(SECTOR_DOMAIN_MAP)) {
      for (const domain of domains) {
        expect(domainIds.has(domain), `${key} -> ${domain}`).toBe(true);
      }
    }
    for (const [key, domains] of Object.entries(APP_KIND_DOMAIN_MAP)) {
      for (const domain of domains) {
        expect(domainIds.has(domain), `${key} -> ${domain}`).toBe(true);
      }
    }
    for (const [key, domains] of Object.entries(BRAND_CATEGORY_DOMAIN_MAP)) {
      for (const domain of domains) {
        expect(domainIds.has(domain), `${key} -> ${domain}`).toBe(true);
      }
    }
  });
});
