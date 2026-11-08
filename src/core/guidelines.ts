import MiniSearch, { type SearchResult } from "minisearch";
import {
  clampMaxTokens,
  DEFAULT_GUIDELINES_MAX_TOKENS,
  estimateTokens,
  fitJson,
  fitText,
} from "./budget.js";
import type { ContentLoader } from "./content/loader.js";
import type { GuidelinePack } from "./schema.js";
import { normalizeWhitespace, stemTerm, summarize, tokenize } from "./text.js";

export type GuidelineFormat = "json" | "markdown";
export type GuidelineSeverity = "error" | "warn" | "info";

export interface GuidelinesRequest {
  query?: string;
  category?: string;
  severity?: GuidelineSeverity;
  limit?: number;
  maxTokens?: number;
  format?: GuidelineFormat;
}

export interface GuidelineCard {
  id: string;
  text: string;
  summary: string;
  category: string;
  severity: GuidelineSeverity;
  instead: string;
  tags: string[];
  sourcePath: string;
  line: number;
  sourceUrl?: string;
}

export interface GuidelinesResult {
  format: GuidelineFormat;
  query: string;
  total: number;
  returned: number;
  categories: Array<{ name: string; count: number }>;
  rules: GuidelineCard[];
  markdown?: string;
  truncated: boolean;
  hints: string[];
}

function normalizeCategory(value: string): string {
  return normalizeWhitespace(value.toLowerCase().replace(/[^a-z0-9]+/g, " "));
}

function card(rule: GuidelinePack): GuidelineCard {
  return {
    id: rule.id,
    text: rule.text,
    summary: summarize(rule.summary, 240),
    category: rule.category,
    severity: rule.severity,
    instead: rule.instead,
    tags: rule.tags.slice(0, 10),
    sourcePath: rule.sourcePath,
    line: rule.line,
    sourceUrl: rule.sourceUrl,
  };
}

function severityLabel(severity: GuidelineSeverity): string {
  return severity === "error" ? "MUST FIX" : severity === "warn" ? "SHOULD" : "INFO";
}

function markdownFor(result: GuidelinesResult): string {
  const lines: string[] = [
    "# Web interface guidelines",
    "",
    result.query
      ? `Filtered by **${result.query}**. ${result.total} matching rules.`
      : `${result.total} rules from the pinned Vercel Web Interface Guidelines.`,
    "",
  ];
  let currentCategory = "";
  for (const rule of result.rules) {
    if (rule.category !== currentCategory) {
      currentCategory = rule.category;
      lines.push(`## ${currentCategory}`, "");
    }
    lines.push(`- [ ] **${severityLabel(rule.severity)}** — ${rule.text}`);
    if (rule.instead) lines.push(`  - Instead: ${rule.instead}`);
    lines.push(`  - \`${rule.id}\` · ${rule.sourcePath}:${rule.line}`);
  }
  if (result.truncated) {
    lines.push("", "_…more rules were truncated to fit the response budget._");
  }
  return lines.join("\n");
}

function fitResult(result: GuidelinesResult, maxTokens: number): GuidelinesResult {
  if (estimateTokens(result) <= maxTokens) return result;
  let rules = result.rules.map((rule) => ({
    ...rule,
    summary: summarize(rule.summary, 120),
    tags: rule.tags.slice(0, 5),
  }));
  let working: GuidelinesResult = { ...result, rules };
  if (estimateTokens(working) <= maxTokens) return { ...working, truncated: true };
  while (rules.length > 1 && estimateTokens(working) > maxTokens) {
    rules = rules.slice(0, -1);
    working = { ...working, rules, returned: rules.length, truncated: true };
  }
  if (estimateTokens(working) > maxTokens) {
    working = {
      ...working,
      rules: rules.map((rule) => ({
        ...rule,
        summary: summarize(rule.summary, 48),
        tags: [],
      })),
      truncated: true,
    };
  }

  const fitted = fitJson(working, maxTokens, {
    requiredKeys: [
      "format",
      "query",
      "total",
      "returned",
      "categories",
      "rules",
      "truncated",
      "hints",
    ],
    arrayKeys: ["rules", "categories", "hints"],
    itemKeys: [
      "id",
      "text",
      "summary",
      "category",
      "severity",
      "instead",
      "sourcePath",
      "line",
      "sourceUrl",
    ],
  });
  return {
    ...fitted.value,
    returned: fitted.value.rules.length,
    truncated: true,
  };
}

/**
 * The guidelines service is intentionally separate from catalog search: audit
 * rules are a different unit of work and need category/severity filtering plus
 * a checklist-shaped Markdown output.
 */
export class GuidelinesService {
  private readonly loader: ContentLoader;
  private indexPromise?: Promise<MiniSearch<GuidelinePack>>;
  private rulesPromise?: Promise<GuidelinePack[]>;

  constructor(loader: ContentLoader) {
    this.loader = loader;
  }

  private async rules(): Promise<GuidelinePack[]> {
    this.rulesPromise ??= this.loader.guidelines().then((packs) => packs as GuidelinePack[]);
    return this.rulesPromise;
  }

  private async index(): Promise<MiniSearch<GuidelinePack>> {
    this.indexPromise ??= (async () => {
      const rules = await this.rules();
      const index = new MiniSearch<GuidelinePack>({
        idField: "id",
        fields: ["text", "category", "tags", "instead", "summary"],
        storeFields: ["id"],
        tokenize,
        processTerm: (term) => {
          const stemmed = stemTerm(term.toLowerCase());
          return stemmed.length > 1 ? stemmed : null;
        },
        searchOptions: {
          boost: { text: 3, instead: 1.6, category: 1.4, tags: 1.2, summary: 0.8 },
          fuzzy: 0.2,
          prefix: true,
          // Audit queries are short and specific. Requiring every meaningful
          // term keeps fuzzy matching from returning the whole rubric.
          combineWith: "AND",
          weights: { fuzzy: 0.25, prefix: 0.5 },
        },
      });
      index.addAll(rules);
      return index;
    })();
    return this.indexPromise;
  }

  async get(request: GuidelinesRequest = {}): Promise<GuidelinesResult> {
    const query = normalizeWhitespace(request.query ?? "");
    const limit = Math.min(104, Math.max(1, Math.floor(request.limit ?? 20)));
    const maxTokens = clampMaxTokens(request.maxTokens, DEFAULT_GUIDELINES_MAX_TOKENS);
    const format = request.format ?? "json";
    const rules = await this.rules();
    const categoryFilter = request.category ? normalizeCategory(request.category) : undefined;

    const matches = (rule: GuidelinePack): boolean => {
      if (request.severity && rule.severity !== request.severity) return false;
      if (categoryFilter) {
        const category = normalizeCategory(rule.category);
        if (category !== categoryFilter && !category.includes(categoryFilter)) {
          return false;
        }
      }
      return true;
    };

    let ordered: GuidelinePack[];
    if (query) {
      const index = await this.index();
      const results = index.search(query, {
        filter: (result) => {
          const rule = rules.find((candidate) => candidate.id === result.id);
          return rule ? matches(rule) : false;
        },
      });
      const byId = new Map(rules.map((rule) => [rule.id, rule]));
      ordered = results
        .map((result: SearchResult) => byId.get(String(result.id)))
        .filter((rule): rule is GuidelinePack => Boolean(rule));
    } else {
      ordered = rules.filter(matches);
    }

    ordered = ordered.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.severity !== b.severity) {
        const order = { error: 0, warn: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      }
      return a.line - b.line;
    });

    const counts = new Map<string, number>();
    for (const rule of ordered) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    const categories = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const hints: string[] = [];
    if (query && ordered.length === 0) {
      hints.push(
        "No matching rules. Try a broader term such as focus, contrast, motion, forms, or overflow.",
      );
    }
    hints.push(
      "Use severity=error for must-fix issues. Rules are from the pinned Vercel Web Interface Guidelines; cite the id and source line.",
    );

    let result: GuidelinesResult = {
      format,
      query,
      total: ordered.length,
      returned: Math.min(limit, ordered.length),
      categories,
      rules: ordered.slice(0, limit).map(card),
      truncated: ordered.length > limit,
      hints,
    };

    if (format === "markdown") {
      const markdown = markdownFor(result);
      const fitted = fitText(markdown, maxTokens);
      return {
        ...result,
        markdown: fitted.value,
        truncated: result.truncated || fitted.truncated,
      };
    }

    result = fitResult(result, maxTokens);
    return result;
  }

  async categories(): Promise<Array<{ name: string; count: number }>> {
    const rules = await this.rules();
    const counts = new Map<string, number>();
    for (const rule of rules) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
