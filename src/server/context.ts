import { ContentLoader, type ContentLoaderOptions } from "../core/content/loader.js";
import { GetService } from "../core/get.js";
import { GuidelinesService } from "../core/guidelines.js";
import { SearchService } from "../core/search.js";

export interface TasteProContextOptions extends ContentLoaderOptions {}

export interface TasteProContext {
  loader: ContentLoader;
  search: SearchService;
  get: GetService;
  guidelines: GuidelinesService;
  startedAt: string;
}

/**
 * Shared, immutable services for every MCP session. Building the MiniSearch
 * indexes is lazy, so a stdio client that only reads the skill resource pays
 * almost nothing at startup.
 */
export function createTasteProContext(options: TasteProContextOptions = {}): TasteProContext {
  const loader = new ContentLoader(options);
  const search = new SearchService(loader);
  return {
    loader,
    search,
    get: new GetService(loader, search),
    guidelines: new GuidelinesService(loader),
    startedAt: new Date().toISOString(),
  };
}
