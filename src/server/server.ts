import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AuditService } from "../core/audit.js";
import {
  CONTENT_KINDS,
  type ContentKind,
  type DomainPack,
  type GuidelinePack,
  QUALITY_LEVELS,
  type Quality,
  SOURCE_IDS,
  type SourceId,
} from "../core/schema.js";
import { VERSION } from "../version.js";
import { fetchAuditHtml } from "./audit-fetch.js";
import type { TasteProContext } from "./context.js";
import { SERVER_INSTRUCTIONS, SKILL_MARKDOWN } from "./instructions.js";
import { hasScope } from "./oauth.js";

/** Scope required to call taste_audit on an auth-gated hosted deployment. */
export const AUDIT_SCOPE = "tastepro:audit";

export interface AuditToolOptions {
  service: AuditService;
  /** Allow the url input, fetched through the SSRF-guarded path. */
  allowUrlFetch?: boolean;
  /** Scope required when the server runs behind auth. Defaults to AUDIT_SCOPE. */
  requiredScope?: string;
}

export interface ServerAuth {
  /** Verified scopes for this session. Undefined means local, unauthenticated use. */
  scopes: string[];
}

function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent:
      typeof value === "object" && value !== null
        ? (value as unknown as Record<string, unknown>)
        : undefined,
  };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `TastePro error: ${message}\n\nIf this is a content or setup problem, run \`tastepro info\` or check /healthz.`,
      },
    ],
  };
}

function asArray<T>(value: T | readonly T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? [...value] : [value as T];
}

function jsonResource(uri: URL, value: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function domainCard(domain: DomainPack) {
  return {
    id: domain.id,
    name: domain.name,
    family: domain.family,
    description: domain.description,
    aliases: domain.aliases,
    status: domain.status,
    depth: domain.depth,
    launchTier: domain.launchTier,
    upstreamSectors: domain.upstreamSectors,
    questions: domain.questions.length > 0 ? domain.questions : (domain.playbook?.questions ?? []),
    playbook: domain.playbook
      ? {
          audience: domain.playbook.audience,
          jobs: domain.playbook.jobs,
          trust: domain.playbook.trust,
          informationArchitecture: domain.playbook.informationArchitecture,
          conversion: domain.playbook.conversion,
          contentChecklist: domain.playbook.contentChecklist,
          antiPatterns: domain.playbook.antiPatterns,
          signatureMoves: domain.playbook.signatureMoves,
          recommendedDirections: domain.playbook.recommendedDirections,
          recommendedSections: domain.playbook.recommendedSections,
          recommendedPalettes: domain.playbook.recommendedPalettes,
          liveThing: domain.playbook.liveThing,
          notes: domain.playbook.notes,
        }
      : null,
  };
}

export interface CreateServerOptions {
  context: TasteProContext;
  /** When set, the taste_audit tool is registered. */
  audit?: AuditToolOptions;
  /** Verified principal scopes for hosted sessions; omitted for local stdio. */
  auth?: ServerAuth;
}

/**
 * Build a fresh MCP server bound to shared content services. HTTP sessions each
 * get their own McpServer/transport pair; stdio gets exactly one.
 */
export function createTasteProServer(options: CreateServerOptions): McpServer {
  const { context, audit, auth } = options;
  const server = new McpServer(
    { name: "tastepro", version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "taste_search",
    {
      title: "Search design taste and domain playbooks",
      description:
        "Search TastePro's catalog of design directions, palettes, type pairings, hero/section blueprints, brand analyses, domain playbooks, and references. Use this first for any visual brief. Returns compact cards with ids; call taste_get for the full pack. Filters: kind, domain, quality, source. Default budget 1400 tokens.",
      inputSchema: {
        query: z
          .string()
          .max(400)
          .optional()
          .describe(
            "Natural-language query: product, audience, domain, mood, or visual idea. Empty returns a curated browse list.",
          ),
        kind: z
          .union([
            z.enum(CONTENT_KINDS),
            z.array(z.enum(CONTENT_KINDS)).min(1).max(CONTENT_KINDS.length),
          ])
          .optional()
          .describe("Filter by one or more content kinds."),
        domain: z
          .string()
          .max(80)
          .optional()
          .describe("Canonical domain id or alias, e.g. fintech-payments, healthcare, portfolio."),
        quality: z
          .union([
            z.enum(QUALITY_LEVELS),
            z.array(z.enum(QUALITY_LEVELS)).min(1).max(QUALITY_LEVELS.length),
          ])
          .optional()
          .describe("Filter by quality level. verified and reviewed are strongest."),
        source: z.enum(SOURCE_IDS).optional().describe("Filter by upstream source id."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum cards to return (default 12, max 50)."),
        maxTokens: z
          .number()
          .int()
          .min(128)
          .max(24_000)
          .optional()
          .describe("Approximate response budget in tokens (default 1400)."),
        includeIncomplete: z
          .boolean()
          .optional()
          .describe("Include incomplete/draft packs for inspection. Default false."),
        includePlanned: z
          .boolean()
          .optional()
          .describe("Include taxonomy-only planned domains. Default true."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const result = await context.search.search({
          query: args.query,
          kinds: asArray(args.kind) as ContentKind[] | undefined,
          domain: args.domain,
          quality: asArray(args.quality) as Quality[] | undefined,
          source: args.source as SourceId | undefined,
          limit: args.limit,
          maxTokens: args.maxTokens,
          includeIncomplete: args.includeIncomplete,
          includePlanned: args.includePlanned,
        });
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "taste_get",
    {
      title: "Get full design packs by id",
      description:
        "Fetch one or more packs by id after taste_search. Use format=brief for decisions, full/markdown for implementation detail, and json for raw data. For references, includeBody=true returns the entire document. Default budget 2400 tokens.",
      inputSchema: {
        ids: z
          .union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1).max(12)])
          .describe(
            "One id or an array of ids, e.g. domain/fintech-payments, direction/quiet-instrument, palette/white-navy-tab.",
          ),
        format: z
          .enum(["brief", "full", "markdown", "json"])
          .optional()
          .describe("Response projection. Default brief."),
        maxTokens: z
          .number()
          .int()
          .min(128)
          .max(24_000)
          .optional()
          .describe("Approximate response budget in tokens (default 2400)."),
        includeBody: z
          .boolean()
          .optional()
          .describe("Include the full body of a reference pack instead of an excerpt."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const result = await context.get.get({
          ids: args.ids,
          format: args.format,
          maxTokens: args.maxTokens,
          includeBody: args.includeBody,
        });
        if (args.format === "markdown" && typeof result.packs[0] === "string") {
          const missing =
            result.missing.length > 0
              ? `\n\n_Not found: ${result.missing.join(", ")}. Use taste_search._`
              : "";
          return textResult(`${result.packs[0]}${missing}`);
        }
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "taste_guidelines",
    {
      title: "Query the web interface audit rubric",
      description:
        "Query the pinned Vercel Web Interface Guidelines: 104 accessibility, focus, form, animation, typography, content, image, performance, navigation, touch, layout, dark-mode, i18n, hydration, hover, copy, and anti-pattern rules. Use format=markdown for a checklist and severity=error for must-fix issues.",
      inputSchema: {
        query: z
          .string()
          .max(300)
          .optional()
          .describe(
            "Topic query: focus, contrast, motion, forms, overflow, images, navigation, etc.",
          ),
        category: z
          .string()
          .max(80)
          .optional()
          .describe(
            "Category or partial category, e.g. Accessibility, Focus States, Anti-patterns.",
          ),
        severity: z
          .enum(["error", "warn", "info"])
          .optional()
          .describe("Filter by severity. error rules are must-fix."),
        format: z
          .enum(["json", "markdown"])
          .optional()
          .describe("json (default) or markdown checklist."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(104)
          .optional()
          .describe("Maximum rules to return (default 20)."),
        maxTokens: z
          .number()
          .int()
          .min(128)
          .max(24_000)
          .optional()
          .describe("Approximate response budget in tokens (default 1800)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const result = await context.guidelines.get({
          query: args.query,
          category: args.category,
          severity: args.severity,
          format: args.format,
          limit: args.limit,
          maxTokens: args.maxTokens,
        });
        if (result.format === "markdown" && result.markdown) {
          return textResult(result.markdown);
        }
        return textResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  if (audit) {
    const requiredScope = audit.requiredScope ?? AUDIT_SCOPE;
    server.registerTool(
      "taste_audit",
      {
        title: "Audit submitted HTML against the web-interface rubric",
        description:
          "Check submitted HTML (or a fetched URL, when the server allows it) against the pinned web-interface guidelines. Returns findings with guideline id, severity, evidence, and a fix, plus an explicit list of what this audit cannot verify. Nothing is stored. URL fetching and browser rendering are server-side opt-ins.",
        inputSchema: {
          html: z
            .string()
            .min(1)
            .max(1_000_000)
            .optional()
            .describe(
              "HTML document or component to audit, up to 1,000,000 characters. Not persisted.",
            ),
          url: z
            .string()
            .max(2_000)
            .optional()
            .describe(
              "Public http(s) URL to fetch and audit. Rejected unless the server sets TASTEPRO_AUDIT_ALLOW_URL_FETCH=true.",
            ),
          target: z
            .string()
            .max(500)
            .optional()
            .describe("Short label for the report, e.g. 'checkout page'. Not fetched."),
          mode: z
            .enum(["static", "browser"])
            .optional()
            .describe(
              "static parses the HTML directly (default). browser renders it with JavaScript disabled when the server sets TASTEPRO_AUDIT_BROWSER=playwright.",
            ),
          maxTokens: z
            .number()
            .int()
            .min(256)
            .max(8_000)
            .optional()
            .describe("Approximate response budget in tokens (default 2000)."),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          if (auth && !hasScope(auth, requiredScope)) {
            return errorResult(
              new Error(
                `taste_audit requires the "${requiredScope}" scope. Request it from your authorization server, or use the read-only taste_search, taste_get, and taste_guidelines tools.`,
              ),
            );
          }

          let html = args.html;
          let target = args.target;
          if (args.url) {
            if (!audit.allowUrlFetch) {
              return errorResult(
                new Error(
                  "URL input is disabled on this server. Submit the HTML directly, or enable TASTEPRO_AUDIT_ALLOW_URL_FETCH.",
                ),
              );
            }
            const fetched = await fetchAuditHtml(args.url);
            html = fetched.html;
            target = target ?? fetched.finalUrl;
          }
          if (!html) {
            return errorResult(
              new Error("Provide html to audit (or url when the server allows URL input)."),
            );
          }

          const result = await audit.service.audit({
            html,
            target,
            mode: args.mode ?? "static",
            maxTokens: args.maxTokens,
          });
          return textResult(result);
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }

  server.registerResource(
    "catalog",
    "tastepro://catalog",
    {
      title: "TastePro catalog index",
      description:
        "Content stats, counts, source pins, and the domain index. Use taste_search for cards and taste_get for packs.",
      mimeType: "application/json",
    },
    async (uri) => {
      const [stats, domains, sources] = await Promise.all([
        context.loader.stats(),
        context.loader.domains(),
        context.loader.sources(),
      ]);
      return jsonResource(uri, {
        name: "TastePro",
        version: VERSION,
        description:
          "Design taste, domain playbooks, references, and a web-interface audit rubric for coding agents.",
        stats: {
          generatedAt: stats.generatedAt,
          contentHash: stats.contentHash,
          catalogEntries: stats.catalogEntries,
          counts: stats.counts,
          quality: stats.quality,
          warnings: stats.warnings,
        },
        sources,
        domains: (domains as DomainPack[]).map((domain) => ({
          id: domain.id,
          name: domain.name,
          family: domain.family,
          description: domain.description,
          status: domain.status,
          depth: domain.depth,
          launchTier: domain.launchTier,
        })),
        next: "Call taste_search with a product, domain, mood, or visual idea. Then taste_get with the chosen ids.",
      });
    },
  );

  server.registerResource(
    "taxonomy",
    "tastepro://taxonomy/domains",
    {
      title: "Domain taxonomy and playbooks",
      description:
        "The 40-domain taxonomy with aliases, launch tier, questions, and authored playbooks where available.",
      mimeType: "application/json",
    },
    async (uri) => {
      const domains = (await context.loader.domains()) as DomainPack[];
      return jsonResource(uri, {
        count: domains.length,
        families: [...new Set(domains.map((domain) => domain.family))].sort(),
        domains: domains.map(domainCard),
        note: "status=planned and depth=taxonomy means the domain has questions and mappings but no deep playbook yet. Use the family fallback and the questions.",
      });
    },
  );

  server.registerResource(
    "stats",
    "tastepro://stats",
    {
      title: "Content build stats",
      description:
        "Generated content counts, quality mix, pinned sources, and validation warnings.",
      mimeType: "application/json",
    },
    async (uri) => {
      const [stats, sources] = await Promise.all([
        context.loader.stats(),
        context.loader.sources(),
      ]);
      return jsonResource(uri, { stats, sources });
    },
  );

  server.registerResource(
    "skill",
    "tastepro://skill",
    {
      title: "TastePro skill guide",
      description:
        "How to use the tools, the content model, a good build sequence, and attribution rules.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: SKILL_MARKDOWN }],
    }),
  );

  server.registerResource(
    "pack",
    new ResourceTemplate("tastepro://pack/{+id}", {
      list: undefined,
      complete: {
        id: async (value) => {
          const entries = await context.loader.catalog();
          return entries
            .filter((entry) => entry.id.includes(value))
            .slice(0, 50)
            .map((entry) => entry.id);
        },
      },
    }),
    {
      title: "Content pack",
      description: "Any catalog pack by id, returned as JSON. References include their full body.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const raw = variables.id;
      const id = decodeURIComponent(String(Array.isArray(raw) ? raw[0] : (raw ?? "")));
      const pack = await context.loader.pack(id);
      if (!pack) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Pack not found: ${id}. Use taste_search to find a valid id.`,
            },
          ],
        };
      }
      if (pack.kind === "reference") {
        const document = await context.loader.referenceDocument(pack);
        return jsonResource(uri, { ...pack, body: document?.body ?? pack.body });
      }
      return jsonResource(uri, pack);
    },
  );

  server.registerResource(
    "guideline",
    new ResourceTemplate("tastepro://guideline/{+id}", {
      list: undefined,
      complete: {
        id: async (value) => {
          const rules = (await context.loader.guidelines()) as GuidelinePack[];
          return rules
            .filter((rule) => rule.id.includes(value))
            .slice(0, 50)
            .map((rule) => rule.id);
        },
      },
    }),
    {
      title: "Web interface guideline",
      description: "One guideline rule by id, returned as JSON.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const raw = variables.id;
      const id = decodeURIComponent(String(Array.isArray(raw) ? raw[0] : (raw ?? "")));
      const pack = await context.loader.pack(id);
      if (pack?.kind !== "guideline") {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Guideline not found: ${id}. Use taste_guidelines to query rules.`,
            },
          ],
        };
      }
      return jsonResource(uri, pack);
    },
  );

  server.registerPrompt(
    "design_brief",
    {
      title: "Build a design brief",
      description:
        "Create a concrete design brief for a product or page using TastePro domain playbooks, directions, palettes, and type pairings.",
      argsSchema: {
        project: z.string().min(1).max(400).describe("What are you building, for whom?"),
        domain: z.string().max(80).optional().describe("Optional domain id or alias."),
        constraints: z
          .string()
          .max(1_000)
          .optional()
          .describe("Brand, technical, content, or accessibility constraints."),
      },
    },
    async (args) => ({
      description: `Design brief for ${args.project}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Build a design brief for: ${args.project}`,
              args.domain ? `Domain hint: ${args.domain}` : "",
              args.constraints ? `Constraints: ${args.constraints}` : "",
              "",
              "Work in this order:",
              "1. Call taste_search with the product and audience. If a domain playbook exists, call taste_get for it.",
              "2. Choose one direction, one palette, one type pairing, and the hero/sections the page actually needs. Do not blend directions.",
              "3. Call taste_get for the chosen packs (format=brief) and read their ideas, pitfalls, and mobile notes.",
              "4. Call taste_guidelines for the components you will build; treat error rules as must-fix.",
              "5. Return: (a) the argument in one sentence, (b) the content and section plan, (c) the visual system with tokens and type, (d) the interaction/motion plan, (e) the accessibility and audit checklist, (f) the exact TastePro ids and sources used.",
              "",
              "Be specific. Reject generic AI landing-page tropes. Do not impersonate a brand or invent proof.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "design_audit",
    {
      title: "Plan a design audit",
      description:
        "Turn a page, URL, or component into a prioritized audit plan using the web-interface guidelines and TastePro references.",
      argsSchema: {
        target: z.string().min(1).max(1_000).describe("URL, file, component, or page description."),
        focus: z
          .string()
          .max(400)
          .optional()
          .describe("Optional focus: accessibility, motion, conversion, mobile, etc."),
      },
    },
    async (args) => ({
      description: `Design audit plan for ${args.target}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Plan a design audit for: ${args.target}`,
              args.focus ? `Focus: ${args.focus}` : "",
              "",
              "Use TastePro rather than generic advice:",
              "1. Identify the page type and domain. Call taste_search and taste_get for the domain playbook.",
              "2. Call taste_guidelines with format=markdown and severity=error. Then query the categories relevant to the target.",
              "3. If the target is a URL, use the browser/Playwright workflow available in your environment; do not claim to have inspected a page you could not load.",
              "4. Return a prioritized report: blocking accessibility/correctness issues, structural/design issues, content/trust issues, then polish. For each finding: evidence, why it matters, exact fix, and the guideline id.",
              "5. End with what you could not verify.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
