import { uniqueStrings } from "../../src/core/text.js";

/**
 * The upstream libraries use their own sector vocabulary. Every upstream value
 * maps to one or more stable TastePro domain ids. Keep this mapping explicit:
 * silent fuzzy matching is how a "fintech" query starts returning restaurants.
 */
export const SECTOR_DOMAIN_MAP: Record<string, string[]> = {
  agency: ["creative-agencies"],
  "ai-product": ["ai-products"],
  architecture: ["architecture"],
  "consumer-app": ["productivity", "product-surfaces"],
  culture: ["culture-arts"],
  "dev-tool": ["developer-tools"],
  ecommerce: ["ecommerce-dtc"],
  education: ["education-edtech"],
  event: ["events"],
  fashion: ["fashion-beauty"],
  finance: ["fintech-payments"],
  health: ["healthcare-wellness"],
  hospitality: ["travel-hospitality"],
  music: ["music"],
  nonprofit: ["nonprofit-civic"],
  other: [],
  "personal-portfolio": ["portfolios"],
  "physical-product": ["ecommerce-dtc"],
  "real-estate": ["real-estate"],
  restaurant: ["restaurants-food"],
  saas: ["b2b-saas"],
  "studio-portfolio": ["creative-agencies"],
};

export const APP_KIND_DOMAIN_MAP: Record<string, string[]> = {
  analytics: ["data-analytics"],
  builder: ["developer-tools", "productivity"],
  commerce: ["ecommerce-dtc"],
  community: ["community-social"],
  creator: ["media-editorial", "productivity"],
  devtools: ["developer-tools"],
  finance: ["fintech-payments"],
  markets: ["fintech-payments", "crypto-web3"],
  report: ["data-analytics"],
  "smb-admin": ["b2b-saas"],
  support: ["b2b-saas"],
  wallet: ["fintech-payments", "crypto-web3"],
  workspace: ["productivity"],
};

export const BRAND_CATEGORY_DOMAIN_MAP: Record<string, string[]> = {
  "AI & LLM Platforms": ["ai-products"],
  "Developer Tools & IDEs": ["developer-tools"],
  "Backend, Database & DevOps": ["developer-tools", "b2b-saas"],
  "Productivity & SaaS": ["b2b-saas", "productivity"],
  "Design & Creative Tools": ["creative-agencies", "b2b-saas"],
  "Fintech & Crypto": ["fintech-payments", "crypto-web3"],
  "E-commerce & Retail": ["ecommerce-dtc", "retail"],
  "Media & Consumer Tech": ["media-editorial", "telecom"],
  Automotive: ["automotive"],
  "Retro Web": ["media-editorial", "culture-arts"],
};

export function mapSector(sector: string): string[] {
  return SECTOR_DOMAIN_MAP[sector] ?? [];
}

export function mapSectors(sectors: readonly string[]): string[] {
  return uniqueStrings(sectors.flatMap((sector) => mapSector(sector)));
}

export function mapAppKinds(kinds: readonly string[]): string[] {
  return uniqueStrings(kinds.flatMap((kind) => APP_KIND_DOMAIN_MAP[kind] ?? []));
}

export function mapBrandCategory(category: string): string[] {
  return BRAND_CATEGORY_DOMAIN_MAP[category] ?? [];
}
