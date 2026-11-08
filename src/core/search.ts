import MiniSearch, { type SearchResult } from "minisearch";
import { clampMaxTokens, DEFAULT_SEARCH_MAX_TOKENS, estimateTokens, fitJson } from "./budget.js";
import type { ContentLoader } from "./content/loader.js";
import {
  type CatalogEntry,
  type ContentKind,
  type DomainPack,
  KIND_PRIORITY,
  type Quality,
  SERVED_QUALITIES,
  type SourceId,
} from "./schema.js";
import { normalizeWhitespace, searchTerms, stemTerm, summarize, tokenize } from "./text.js";

export interface SearchRequest {
  query?: string;
  kinds?: ContentKind[];
  domain?: string;
  quality?: Quality[];
  source?: SourceId;
  limit?: number;
  maxTokens?: number;
  includeIncomplete?: boolean;
  includePlanned?: boolean;
}

export interface SearchCard {
  id: string;
  kind: ContentKind;
  name: string;
  summary: string;
  domains: string[];
  tags: string[];
  moods: string[];
  quality: Quality;
  source: SourceId;
  sourceUrl?: string;
  status?: "available" | "planned";
  depth?: "taxonomy" | "seed" | "playbook";
  metrics?: Record<string, string | number | boolean>;
  score?: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  returned: number;
  results: SearchCard[];
  truncated: boolean;
  hints: string[];
  /** How the query was matched. Browse means no query was supplied. */
  match: "browse" | "all-terms" | "any-term" | "domain-fallback";
  /** Number of filtered packs that contain every query term. */
  matchedAllTerms: number;
  /** Same-family playbooks added because the inferred domain has no playbook. */
  familyFallback: string[];
  applied: {
    kinds?: ContentKind[];
    domain?: string;
    quality?: Quality[];
    source?: SourceId;
    includeIncomplete: boolean;
  };
}

const QUALITY_BOOST: Record<Quality, number> = {
  verified: 1.35,
  reviewed: 1.2,
  reference: 1,
  draft: 0.55,
  incomplete: 0.4,
};

const QUALITY_RANK: Record<Quality, number> = {
  verified: 0,
  reviewed: 1,
  reference: 2,
  draft: 3,
  incomplete: 4,
};

function normalizePhrase(value: string): string {
  return normalizeWhitespace(value.toLowerCase().replace(/[^a-z0-9]+/g, " "));
}

function termCoverage(entry: CatalogEntry, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const searchable = [
    entry.name,
    entry.summary,
    ...entry.tags,
    ...entry.domains,
    ...entry.sectors,
    ...entry.moods,
    entry.kind,
  ]
    .join(" ")
    .toLowerCase();
  const tokens = new Set(tokenize(searchable).map((term) => stemTerm(term)));
  return terms.reduce((count, term) => count + (tokens.has(stemTerm(term)) ? 1 : 0), 0);
}

function cardFromEntry(entry: CatalogEntry, score?: number): SearchCard {
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    summary: summarize(entry.summary, 220),
    domains: entry.domains,
    tags: entry.tags.slice(0, 10),
    moods: entry.moods,
    quality: entry.quality,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    status: entry.status,
    depth: entry.depth,
    metrics: entry.metrics,
    score: score === undefined ? undefined : Math.round(score * 1000) / 1000,
  };
}

function compactCard(card: SearchCard, level: number): SearchCard {
  if (level === 0) return card;
  return {
    ...card,
    summary: summarize(card.summary, level === 1 ? 160 : 110),
    tags: card.tags.slice(0, level === 1 ? 8 : 5),
    moods: card.moods.slice(0, level === 1 ? 5 : 3),
    metrics: level >= 2 ? undefined : card.metrics,
  };
}

function fitSearchResponse(response: SearchResponse, maxTokens: number): SearchResponse {
  if (estimateTokens(response) <= maxTokens) return response;
  let working: SearchResponse = {
    ...response,
    results: response.results.map((card) => compactCard(card, 1)),
  };
  if (estimateTokens(working) <= maxTokens) return { ...working, truncated: true };
  working = {
    ...working,
    results: working.results.map((card) => compactCard(card, 2)),
  };
  if (estimateTokens(working) <= maxTokens) return { ...working, truncated: true };

  // Hints and fallback ids are useful, but the cards are the payload. Trim
  // metadata before dropping results.
  working = {
    ...working,
    hints: working.hints.slice(0, 2),
    familyFallback: working.familyFallback.slice(0, 4),
    truncated: true,
  };
  if (estimateTokens(working) <= maxTokens) return working;

  working = {
    ...working,
    hints: working.hints.slice(0, 1),
    familyFallback: working.familyFallback.slice(0, 2),
  };
  if (estimateTokens(working) <= maxTokens) return working;

  while (working.results.length > 1 && estimateTokens(working) > maxTokens) {
    working = {
      ...working,
      results: working.results.slice(0, -1),
      returned: working.results.length - 1,
      truncated: true,
    };
  }
  if (estimateTokens(working) > maxTokens) {
    const [first] = working.results;
    working = {
      ...working,
      results: first
        ? [
            {
              ...first,
              summary: summarize(first.summary, 64),
              tags: [],
              moods: [],
              metrics: undefined,
            },
          ]
        : [],
      returned: first ? 1 : 0,
      hints: [],
      familyFallback: [],
      truncated: true,
    };
  }

  const fitted = fitJson(working, maxTokens, {
    requiredKeys: [
      "query",
      "total",
      "returned",
      "results",
      "truncated",
      "hints",
      "match",
      "matchedAllTerms",
      "familyFallback",
      "applied",
    ],
    arrayKeys: ["results", "familyFallback", "hints"],
    itemKeys: ["id", "kind", "name", "summary", "domains", "quality", "source"],
  });
  return {
    ...fitted.value,
    returned: fitted.value.results.length,
    truncated: true,
  };
}

/**
 * Deterministic catalog search over the compact catalog cards. Full pack text is
 * intentionally not indexed: search should be fast and cheap, and `taste_get`
 * is the step that loads a full playbook.
 */
export class SearchService {
  private readonly loader: ContentLoader;
  private indexPromise?: Promise<MiniSearch<CatalogEntry>>;
  private entryMapPromise?: Promise<Map<string, CatalogEntry>>;
  private aliasIndexPromise?: Promise<{
    phrases: Map<string, string[]>;
    tokens: Map<string, string[]>;
  }>;
  private domainFamilyPromise?: Promise<{
    byId: Map<string, DomainPack>;
    byFamily: Map<string, DomainPack[]>;
  }>;

  constructor(loader: ContentLoader) {
    this.loader = loader;
  }

  private async entries(): Promise<Map<string, CatalogEntry>> {
    this.entryMapPromise ??= this.loader
      .catalog()
      .then((entries) => new Map(entries.map((entry) => [entry.id, entry])));
    return this.entryMapPromise;
  }

  private async index(): Promise<MiniSearch<CatalogEntry>> {
    this.indexPromise ??= (async () => {
      const entries = await this.loader.catalog();
      const index = new MiniSearch<CatalogEntry>({
        idField: "id",
        fields: ["name", "summary", "tags", "domains", "sectors", "moods", "kind"],
        storeFields: ["id", "kind", "domains", "quality", "status"],
        tokenize,
        processTerm: (term) => {
          const stemmed = stemTerm(term.toLowerCase());
          return stemmed.length > 1 ? stemmed : null;
        },
        searchOptions: {
          boost: {
            name: 3.2,
            tags: 2,
            domains: 2.2,
            moods: 1.4,
            summary: 1,
            sectors: 0.8,
            kind: 0.6,
          },
          fuzzy: 0.2,
          prefix: true,
          combineWith: "OR",
          weights: { fuzzy: 0.25, prefix: 0.55 },
        },
      });
      index.addAll(entries);
      return index;
    })();
    return this.indexPromise;
  }

  private async aliasIndex(): Promise<{
    phrases: Map<string, string[]>;
    tokens: Map<string, string[]>;
  }> {
    this.aliasIndexPromise ??= (async () => {
      const phrases = new Map<string, string[]>();
      const tokens = new Map<string, string[]>();
      const domains = (await this.loader.domains()) as DomainPack[];
      const add = (map: Map<string, string[]>, key: string, domain: string) => {
        const normalized = normalizePhrase(key);
        if (!normalized) return;
        const list = map.get(normalized) ?? [];
        if (!list.includes(domain)) list.push(domain);
        map.set(normalized, list);
      };
      for (const domain of domains) {
        const id = domain.id.replace(/^domain\//, "");
        const keys = [id, domain.name, ...domain.aliases];
        for (const key of keys) {
          add(phrases, key, id);
          const words = normalizePhrase(key).split(" ").filter(Boolean);
          if (words.length === 1) add(tokens, words[0]!, id);
        }
      }
      return { phrases, tokens };
    })();
    return this.aliasIndexPromise;
  }

  private async domainFamily(): Promise<{
    byId: Map<string, DomainPack>;
    byFamily: Map<string, DomainPack[]>;
  }> {
    this.domainFamilyPromise ??= (async () => {
      const domains = (await this.loader.domains()) as DomainPack[];
      const byId = new Map<string, DomainPack>();
      const byFamily = new Map<string, DomainPack[]>();
      for (const domain of domains) {
        const id = domain.id.replace(/^domain\//, "");
        byId.set(id, domain);
        const family = domain.family || "uncategorized";
        const list = byFamily.get(family) ?? [];
        list.push(domain);
        byFamily.set(family, list);
      }
      return { byId, byFamily };
    })();
    return this.domainFamilyPromise;
  }

  /**
   * When a query names a domain with no authored playbook, the useful next
   * step is a complete playbook from the same family. This is a fallback, not a
   * claim that the family playbook is domain-specific.
   */
  async familyFallbackDomains(domainIds: Iterable<string>): Promise<string[]> {
    const { byId, byFamily } = await this.domainFamily();
    const requested = [...domainIds]
      .map((id) => byId.get(id))
      .filter((domain): domain is DomainPack => Boolean(domain));
    // If any inferred domain has a real playbook, use it. Family fallback is
    // only for queries that land exclusively on uncovered domains.
    if (requested.length === 0 || requested.some((domain) => Boolean(domain.playbook))) {
      return [];
    }
    const fallback = new Set<string>();
    for (const domain of requested) {
      for (const sibling of byFamily.get(domain.family) ?? []) {
        if (sibling.id !== domain.id && sibling.playbook && sibling.status === "available") {
          fallback.add(sibling.id.replace(/^domain\//, ""));
        }
      }
    }
    return [...fallback].sort();
  }

  /**
   * Return canonical domain ids implied by a natural-language query.
   *
   * Domain names and multi-word aliases are strong signals; single-word aliases
   * are weak signals. Scoring prevents a generic role word such as "developer"
   * (an alias for portfolios) from overriding "developer tool" (a phrase alias
   * for developer-tools).
   */
  async domainsForQuery(query: string): Promise<string[]> {
    const normalized = normalizePhrase(query);
    if (!normalized) return [];
    const { phrases, tokens } = await this.aliasIndex();
    const scores = new Map<string, number>();
    const add = (domain: string, weight: number) => {
      scores.set(domain, (scores.get(domain) ?? 0) + weight);
    };
    for (const [phrase, domains] of phrases) {
      if (!phrase.includes(" ")) continue;
      if (new RegExp(`(?:^| )${escapeRegExp(phrase)}(?: |$)`).test(normalized)) {
        for (const domain of domains) add(domain, 3);
      }
    }
    for (const term of searchTerms(normalized)) {
      const stemmed = stemTerm(term);
      for (const domain of tokens.get(term) ?? tokens.get(stemmed) ?? []) {
        add(domain, 1);
      }
    }
    if (scores.size === 0) return [];
    const max = Math.max(...scores.values());
    const threshold = max >= 3 ? Math.max(1, max - 1) : 1;
    return [...scores.entries()]
      .filter(([, score]) => score >= threshold)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([domain]) => domain);
  }

  async search(request: SearchRequest = {}): Promise<SearchResponse> {
    const query = normalizeWhitespace(request.query ?? "");
    const terms = searchTerms(query);
    const limit = Math.min(50, Math.max(1, Math.floor(request.limit ?? 12)));
    const maxTokens = clampMaxTokens(request.maxTokens, DEFAULT_SEARCH_MAX_TOKENS);
    const entries = await this.entries();
    const queryDomains = new Set(await this.domainsForQuery(query));
    const requestedDomain = request.domain
      ? ((await this.domainsForQuery(request.domain))[0] ?? request.domain)
      : undefined;
    if (requestedDomain) queryDomains.add(requestedDomain);
    // An explicit domain filter stays literal. Family fallback is for natural
    // language queries that name an uncovered domain.
    const fallbackDomains = new Set(
      requestedDomain ? [] : await this.familyFallbackDomains(queryDomains),
    );
    const includeIncomplete = request.includeIncomplete ?? false;
    const includePlanned = request.includePlanned ?? true;
    const kinds = request.kinds?.length ? new Set(request.kinds) : undefined;
    const qualities = request.quality?.length ? new Set(request.quality) : undefined;

    const matchesFilters = (entry: CatalogEntry): boolean => {
      if (kinds && !kinds.has(entry.kind)) return false;
      if (requestedDomain) {
        if (!entry.domains.includes(requestedDomain) && entry.id !== `domain/${requestedDomain}`) {
          return false;
        }
      }
      if (qualities && !qualities.has(entry.quality)) return false;
      if (request.source && entry.source !== request.source) return false;
      if (!includeIncomplete && (entry.quality === "incomplete" || entry.quality === "draft")) {
        return false;
      }
      if (!includePlanned && entry.status === "planned") return false;
      return true;
    };

    const hints: string[] = [];
    const coverageById = new Map<string, number>();
    let usedDomainFallback = false;
    let ranked: Array<{ entry: CatalogEntry; score: number }>;

    if (!query) {
      const browse = [...entries.values()].filter(matchesFilters).sort((a, b) => {
        const aLaunch = a.metrics?.launchTier === true ? 0 : 1;
        const bLaunch = b.metrics?.launchTier === true ? 0 : 1;
        if (a.kind === "domain" && b.kind === "domain" && aLaunch !== bLaunch) {
          return aLaunch - bLaunch;
        }
        const kindOrder = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
        if (kindOrder !== 0) return kindOrder;
        const qualityOrder = QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality];
        if (qualityOrder !== 0) return qualityOrder;
        return a.name.localeCompare(b.name);
      });
      ranked = browse.map((entry) => ({ entry, score: 0 }));
    } else {
      const index = await this.index();
      const filter = (result: SearchResult): boolean => {
        const entry = entries.get(String(result.id));
        return entry ? matchesFilters(entry) : false;
      };
      const boostDocument = (documentId: string | number): number => {
        const entry = entries.get(String(documentId));
        if (!entry) return 0;
        let boost = QUALITY_BOOST[entry.quality] ?? 1;
        if (entry.domains.some((domain) => queryDomains.has(domain))) boost *= 1.75;
        if (entry.kind === "domain") {
          const domainId = entry.id.replace(/^domain\//, "");
          if (queryDomains.has(domainId)) boost *= 1.8;
        }
        if (entry.status === "planned") boost *= 0.8;
        return boost;
      };

      // Precision first: a catalog result must contain every meaningful query
      // term. Fuzzy matching is still allowed within each term, so typos work.
      const andResults = index.search(query, {
        filter,
        boostDocument,
        combineWith: "AND",
      });
      const merged = new Map<string, { entry: CatalogEntry; score: number }>();
      for (const result of andResults) {
        const entry = entries.get(String(result.id));
        if (entry) merged.set(entry.id, { entry, score: result.score });
      }

      // Domain playbooks are the first step of the workflow even when the
      // query describes the product rather than the playbook text itself.
      if (queryDomains.size > 0) {
        const domainResults = index.search(query, {
          filter: (result) => {
            const entry = entries.get(String(result.id));
            if (entry?.kind !== "domain") return false;
            const domainId = entry.id.replace(/^domain\//, "");
            return queryDomains.has(domainId) && matchesFilters(entry);
          },
          boostDocument,
          combineWith: "OR",
        });
        for (const result of domainResults) {
          const entry = entries.get(String(result.id));
          if (entry && !merged.has(entry.id)) {
            merged.set(entry.id, { entry, score: result.score });
          }
        }
        for (const domainId of queryDomains) {
          const entry = entries.get(`domain/${domainId}`);
          if (entry && matchesFilters(entry) && !merged.has(entry.id)) {
            merged.set(entry.id, { entry, score: 0 });
          }
        }
        for (const domainId of fallbackDomains) {
          const entry = entries.get(`domain/${domainId}`);
          if (entry && matchesFilters(entry) && !merged.has(entry.id)) {
            merged.set(entry.id, { entry, score: 0 });
          }
        }
      }

      // A kind filter plus an inferred domain can leave no literal matches even
      // though that kind has packs mapped to the domain. This fallback is
      // deliberately narrow: only when the filtered result set has no
      // non-domain match, so it cannot flood an ordinary search.
      const requestedVisualKinds = kinds ? [...kinds].filter((kind) => kind !== "domain") : [];
      const hasVisualKindMatch = [...merged.values()].some(({ entry }) => entry.kind !== "domain");
      if (
        requestedVisualKinds.length > 0 &&
        !hasVisualKindMatch &&
        query &&
        queryDomains.size > 0
      ) {
        for (const entry of entries.values()) {
          if (!matchesFilters(entry)) continue;
          if (!entry.domains.some((domain) => queryDomains.has(domain))) continue;
          merged.set(entry.id, { entry, score: 0 });
          usedDomainFallback = true;
        }
      }

      for (const { entry } of merged.values()) {
        coverageById.set(entry.id, termCoverage(entry, terms));
      }
      const rankGroup = (entry: CatalogEntry): number => {
        const domainId = entry.id.replace(/^domain\//, "");
        if (entry.kind === "domain" && queryDomains.has(domainId)) return 0;
        if (entry.kind === "domain" && fallbackDomains.has(domainId)) return 1;
        if (terms.length === 0) return 2;
        const coverage = coverageById.get(entry.id) ?? 0;
        if (coverage === terms.length) return 2;
        return coverage > 0 ? 3 : 4;
      };
      ranked = [...merged.values()].sort((a, b) => {
        const groupOrder = rankGroup(a.entry) - rankGroup(b.entry);
        if (groupOrder !== 0) return groupOrder;
        const coverageOrder =
          (coverageById.get(b.entry.id) ?? 0) - (coverageById.get(a.entry.id) ?? 0);
        if (coverageOrder !== 0) return coverageOrder;
        if (b.score !== a.score) return b.score - a.score;
        const qualityOrder = QUALITY_RANK[a.entry.quality] - QUALITY_RANK[b.entry.quality];
        if (qualityOrder !== 0) return qualityOrder;
        const kindOrder = KIND_PRIORITY[a.entry.kind] - KIND_PRIORITY[b.entry.kind];
        if (kindOrder !== 0) return kindOrder;
        return a.entry.name.localeCompare(b.entry.name);
      });
      if (ranked.length === 0) {
        hints.push(
          "No catalog matches. Try a broader domain, a mood such as quiet or bold, or a kind such as direction or brand.",
        );
        const suggestedDomains = [...queryDomains].slice(0, 4);
        if (suggestedDomains.length > 0) {
          hints.push(`Related domains: ${suggestedDomains.join(", ")}.`);
        }
      } else if (andResults.length === 0 && !usedDomainFallback) {
        hints.push(
          "No exact catalog matches; showing inferred domain and family-fallback playbooks.",
        );
      }
    }

    const total = ranked.length;
    const matchedAllTerms =
      terms.length > 0
        ? ranked.filter(({ entry }) => coverageById.get(entry.id) === terms.length).length
        : 0;
    const cards = ranked.slice(0, limit).map(({ entry, score }) => cardFromEntry(entry, score));
    const response: SearchResponse = {
      query,
      total,
      returned: cards.length,
      results: cards,
      truncated: false,
      hints,
      match: !query
        ? "browse"
        : usedDomainFallback
          ? "domain-fallback"
          : matchedAllTerms === total && total > 0
            ? "all-terms"
            : "any-term",
      matchedAllTerms,
      familyFallback: [...fallbackDomains],
      applied: {
        kinds: request.kinds?.length ? request.kinds : undefined,
        domain: requestedDomain,
        quality: request.quality?.length ? request.quality : undefined,
        source: request.source,
        includeIncomplete,
      },
    };

    if (usedDomainFallback) {
      response.hints.push(
        `No literal text matches; showing ${(request.kinds ?? []).join(", ")} mapped to the inferred domain: ${[...queryDomains].slice(0, 4).join(", ")}.`,
      );
    }
    if (queryDomains.size > 0 && query && !usedDomainFallback) {
      response.hints.push(
        `Domain intent: ${[...queryDomains].slice(0, 4).join(", ")}. Domain playbooks are ranked first.`,
      );
    }
    if (fallbackDomains.size > 0) {
      response.hints.push(
        `Family fallback: ${[...fallbackDomains].join(", ")}. These are same-family playbooks, not domain-specific playbooks.`,
      );
    }
    if (query && total > 0 && matchedAllTerms < total && !usedDomainFallback) {
      response.hints.push(
        `${total} packs match at least one term; ${matchedAllTerms} match all terms. Add a domain or kind to narrow.`,
      );
    }
    if (total > cards.length) {
      response.hints.push(
        `Showing ${cards.length} of ${total} matches. Narrow with kind or domain, or raise limit (max 50).`,
      );
    }
    response.hints.push(
      "Use taste_get with an id for the full pack. Use taste_guidelines when the task is an implementation audit.",
    );
    return fitSearchResponse(response, maxTokens);
  }

  /**
   * Lightweight suggestions used when taste_get cannot resolve an id. Missing
   * ids are often typos or kind-prefixed guesses, so this deliberately allows
   * partial matches — but it still requires at least one exact query term.
   */
  async suggest(query: string, limit = 5): Promise<SearchCard[]> {
    const cleaned = normalizeWhitespace(query.replace(/^[a-z-]+\//i, ""));
    const terms = searchTerms(cleaned || query);
    if (terms.length === 0) return [];
    const [entries, index] = await Promise.all([this.entries(), this.index()]);
    const results = index.search(cleaned || query, {
      combineWith: "OR",
      fuzzy: 0.2,
      prefix: true,
    });
    const scored = results
      .map((result: SearchResult) => {
        const entry = entries.get(String(result.id));
        if (!entry) return null;
        if (entry.quality === "incomplete" || entry.quality === "draft") return null;
        const coverage = termCoverage(entry, terms);
        return coverage > 0 ? { entry, score: result.score, coverage } : null;
      })
      .filter(
        (item): item is { entry: CatalogEntry; score: number; coverage: number } => item !== null,
      )
      .sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        if (b.score !== a.score) return b.score - a.score;
        return a.entry.name.localeCompare(b.entry.name);
      });
    return scored
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map(({ entry, score }) => cardFromEntry(entry, score));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { SERVED_QUALITIES };
