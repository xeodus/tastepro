#!/usr/bin/env node
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import type { ContentKind, Quality, SourceId } from "./core/schema.js";
import { CONTENT_KINDS, QUALITY_LEVELS, SOURCE_IDS } from "./core/schema.js";
import { createTasteProContext } from "./server/context.js";
import { type RunningHttpServer, startHttpServer } from "./server/http.js";
import { createLogger, type LogLevel, parseLogLevel } from "./server/logger.js";
import { createTasteProServer } from "./server/server.js";
import { VERSION } from "./version.js";

interface GlobalOptions {
  contentDir?: string;
  logLevel: LogLevel;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseKind(value: string | undefined): ContentKind[] | undefined {
  if (!value) return undefined;
  const kinds = value
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);
  for (const kind of kinds) {
    if (!(CONTENT_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`Invalid kind "${kind}". Expected one of: ${CONTENT_KINDS.join(", ")}`);
    }
  }
  return kinds as ContentKind[];
}

function parseQuality(value: string | undefined): Quality[] | undefined {
  if (!value) return undefined;
  const qualities = value
    .split(",")
    .map((quality) => quality.trim())
    .filter(Boolean);
  for (const quality of qualities) {
    if (!(QUALITY_LEVELS as readonly string[]).includes(quality)) {
      throw new Error(
        `Invalid quality "${quality}". Expected one of: ${QUALITY_LEVELS.join(", ")}`,
      );
    }
  }
  return qualities as Quality[];
}

function parseSource(value: string | undefined): SourceId | undefined {
  if (!value) return undefined;
  if (!(SOURCE_IDS as readonly string[]).includes(value)) {
    throw new Error(`Invalid source "${value}". Expected one of: ${SOURCE_IDS.join(", ")}`);
  }
  return value as SourceId;
}

function output(value: unknown, asJson: boolean): void {
  if (asJson || typeof value !== "string") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    process.stdout.write(`${value}\n`);
  }
}

function globalOptions(command: Command): GlobalOptions {
  const options = command.optsWithGlobals() as { contentDir?: string; logLevel?: string };
  return {
    contentDir: options.contentDir,
    logLevel: parseLogLevel(options.logLevel),
  };
}

async function runStdio(options: GlobalOptions): Promise<void> {
  const logger = createLogger(options.logLevel);
  const context = createTasteProContext({ contentDir: options.contentDir });
  const server: McpServer = createTasteProServer({ context });
  const transport = new StdioServerTransport();
  transport.onclose = () => {
    logger.debug("stdio transport closed");
  };
  transport.onerror = (error) => {
    logger.error("stdio transport error", { error: error.message });
  };
  await server.connect(transport);
  logger.info("tastepro ready on stdio", {
    version: VERSION,
    contentDir: context.loader.contentDir,
  });
}

async function runHttp(
  options: GlobalOptions & {
    host: string;
    port: number;
    apiKey?: string;
    corsOrigin?: string;
    allowedHosts?: string[];
    jsonResponse: boolean;
    sessionTtlMs?: number;
    maxSessions?: number;
  },
): Promise<void> {
  const logger = createLogger(options.logLevel);
  const context = createTasteProContext({ contentDir: options.contentDir });
  let running: RunningHttpServer;
  try {
    running = await startHttpServer({
      context,
      host: options.host,
      port: options.port,
      apiKey: options.apiKey,
      corsOrigin: options.corsOrigin,
      allowedHosts: options.allowedHosts,
      jsonResponse: options.jsonResponse,
      sessionTtlMs: options.sessionTtlMs,
      maxSessions: options.maxSessions,
      logger,
    });
  } catch (error) {
    logger.error("failed to start HTTP server", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  logger.info("tastepro listening", {
    url: running.url,
    endpoint: `${running.url}/mcp`,
    health: `${running.url}/healthz`,
    auth: options.apiKey ? "bearer" : "none",
    contentDir: context.loader.contentDir,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    try {
      await running.close();
    } catch (error) {
      logger.error("shutdown failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const program = new Command();

program
  .name("tastepro")
  .description(
    "Design taste, domain playbooks, references, and a web-interface audit rubric for coding agents.",
  )
  .version(VERSION, "-v, --version")
  .option("--http", "run the Streamable HTTP transport instead of stdio")
  .option("--stdio", "run the stdio transport (default)")
  .option("--host <host>", "HTTP bind host", process.env.TASTEPRO_HOST ?? "127.0.0.1")
  .option("--port <port>", "HTTP port", process.env.TASTEPRO_PORT ?? "3000")
  .option("--api-key <key>", "require this bearer token on /mcp", process.env.TASTEPRO_API_KEY)
  .option(
    "--cors-origin <origins>",
    "comma-separated allowed browser origins, or *",
    process.env.TASTEPRO_CORS_ORIGIN,
  )
  .option(
    "--allowed-hosts <hosts>",
    "comma-separated Host header allowlist for the HTTP transport",
    process.env.TASTEPRO_ALLOWED_HOSTS,
  )
  .option("--sse", "use SSE streaming responses instead of JSON responses", false)
  .option("--session-ttl-minutes <minutes>", "idle HTTP session TTL", "30")
  .option("--max-sessions <count>", "maximum concurrent HTTP sessions", "500")
  .option("--content-dir <path>", "content directory", process.env.TASTEPRO_CONTENT_DIR)
  .option(
    "--log-level <level>",
    "debug | info | warn | error | silent",
    process.env.TASTEPRO_LOG_LEVEL ?? "info",
  )
  .action(async () => {
    const options = globalOptions(program);
    const opts = program.opts();
    if (opts.http) {
      await runHttp({
        ...options,
        host: String(opts.host),
        port: parsePort(String(opts.port)),
        apiKey: opts.apiKey ? String(opts.apiKey) : undefined,
        corsOrigin: opts.corsOrigin ? String(opts.corsOrigin) : undefined,
        allowedHosts: splitList(opts.allowedHosts ? String(opts.allowedHosts) : undefined),
        jsonResponse: !opts.sse,
        sessionTtlMs: Math.max(30_000, Number(opts.sessionTtlMinutes) * 60_000),
        maxSessions: Math.max(1, Number.parseInt(String(opts.maxSessions), 10)),
      });
      return;
    }
    await runStdio(options);
  });

program
  .command("info")
  .description("print content stats, source pins, and catalog counts")
  .option("--json", "print JSON", false)
  .action(async (options, command) => {
    const global = globalOptions(command);
    const context = createTasteProContext({ contentDir: global.contentDir });
    const [stats, sources] = await Promise.all([context.loader.stats(), context.loader.sources()]);
    if (options.json) {
      output({ stats, sources }, true);
      return;
    }
    const lines = [
      `TastePro ${VERSION}`,
      `Content: ${context.loader.contentDir}`,
      `Generated: ${stats.generatedAt}`,
      `Content hash: ${stats.contentHash}`,
      `Catalog entries: ${stats.catalogEntries}`,
      "",
      "Counts:",
      ...Object.entries(stats.counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([kind, count]) => `  ${kind.padEnd(14)} ${count}`),
      "",
      "Quality:",
      ...Object.entries(stats.quality)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([quality, count]) => `  ${quality.padEnd(14)} ${count}`),
      "",
      "Sources:",
      ...sources.map(
        (source) =>
          `  ${source.id.padEnd(24)} ${source.commit.slice(0, 12)}  ${source.license.padEnd(12)} ${source.repo}`,
      ),
      "",
      `Warnings: ${stats.warnings.length}`,
    ];
    if (stats.warnings.length > 0) {
      lines.push(...stats.warnings.map((warning) => `  - ${warning}`));
    }
    output(lines.join("\n"), false);
  });

program
  .command("search")
  .description("search the catalog from the command line")
  .argument("[query...]", "natural-language query")
  .option("--kind <kinds>", "comma-separated content kinds")
  .option("--domain <domain>", "domain id or alias")
  .option("--quality <qualities>", "comma-separated quality levels")
  .option("--source <source>", "upstream source id")
  .option("--limit <count>", "maximum results", "12")
  .option("--max-tokens <tokens>", "response budget", "1400")
  .option("--include-incomplete", "include incomplete/draft packs", false)
  .option("--json", "print JSON", false)
  .action(async (queryParts: string[], options, command) => {
    const global = globalOptions(command);
    const context = createTasteProContext({ contentDir: global.contentDir });
    const response = await context.search.search({
      query: queryParts.join(" "),
      kinds: parseKind(options.kind),
      domain: options.domain,
      quality: parseQuality(options.quality),
      source: parseSource(options.source),
      limit: Number.parseInt(String(options.limit), 10),
      maxTokens: Number.parseInt(String(options.maxTokens), 10),
      includeIncomplete: options.includeIncomplete,
    });
    if (options.json) {
      output(response, true);
      return;
    }
    const lines = [
      `${response.total} matches for "${response.query}" (showing ${response.returned})`,
      "",
      ...response.results.map(
        (card) =>
          `${card.id}\n  ${card.name} · ${card.kind} · ${card.quality}${card.status === "planned" ? " · planned" : ""}\n  ${card.summary}`,
      ),
      "",
      ...response.hints.map((hint) => `Hint: ${hint}`),
    ];
    output(lines.join("\n"), false);
  });

program
  .command("get")
  .description("print one or more packs by id")
  .argument("<ids...>", "content ids")
  .option("--format <format>", "brief | full | markdown | json", "brief")
  .option("--max-tokens <tokens>", "response budget", "2400")
  .option("--include-body", "include the full reference body", false)
  .action(async (ids: string[], options, command) => {
    const global = globalOptions(command);
    const context = createTasteProContext({ contentDir: global.contentDir });
    const response = await context.get.get({
      ids,
      format: options.format,
      maxTokens: Number.parseInt(String(options.maxTokens), 10),
      includeBody: options.includeBody,
    });
    if (options.format === "markdown" && typeof response.packs[0] === "string") {
      output(response.packs[0], false);
      if (response.missing.length > 0) {
        process.stderr.write(`Not found: ${response.missing.join(", ")}\n`);
      }
      return;
    }
    output(response, true);
  });

program
  .command("guidelines")
  .description("query the web interface audit rubric")
  .argument("[query...]", "topic query")
  .option("--category <category>", "category or partial category")
  .option("--severity <severity>", "error | warn | info")
  .option("--format <format>", "json | markdown", "markdown")
  .option("--limit <count>", "maximum rules", "20")
  .option("--max-tokens <tokens>", "response budget", "1800")
  .action(async (queryParts: string[], options, command) => {
    const global = globalOptions(command);
    const context = createTasteProContext({ contentDir: global.contentDir });
    const response = await context.guidelines.get({
      query: queryParts.join(" "),
      category: options.category,
      severity: options.severity,
      format: options.format,
      limit: Number.parseInt(String(options.limit), 10),
      maxTokens: Number.parseInt(String(options.maxTokens), 10),
    });
    if (response.format === "markdown" && response.markdown) {
      output(response.markdown, false);
      return;
    }
    output(response, true);
  });

program
  .command("domains")
  .description("list the domain taxonomy")
  .option("--json", "print JSON", false)
  .action(async (options, command) => {
    const global = globalOptions(command);
    const context = createTasteProContext({ contentDir: global.contentDir });
    const domains = await context.loader.domains();
    if (options.json) {
      output(domains, true);
      return;
    }
    const lines = domains.map(
      (domain) =>
        `${domain.id.replace(/^domain\//, "").padEnd(26)} ${domain.family.padEnd(18)} ${domain.status.padEnd(9)} ${domain.depth.padEnd(9)} ${domain.launchTier ? "launch" : ""}`,
    );
    output(
      ["DOMAIN                     FAMILY             STATUS    DEPTH     TIER", ...lines].join(
        "\n",
      ),
      false,
    );
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
