import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resourceText } from "../helpers/mcp.js";

let client: Client;
let transport: StdioClientTransport;

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

function jsonOf(result: Awaited<ReturnType<Client["callTool"]>>): any {
  return JSON.parse(textOf(result));
}

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/cli.ts", "--stdio"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  client = new Client({ name: "tastepro-stdio-test", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
});

describe("stdio MCP server", () => {
  it("advertises exactly the three read-only tools", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "taste_get",
      "taste_guidelines",
      "taste_search",
    ]);
    for (const tool of tools.tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("serves search, get, and guidelines over JSON-RPC", async () => {
    const search = await client.callTool({
      name: "taste_search",
      arguments: { query: "fintech dashboard", limit: 3 },
    });
    expect(search.isError).toBeFalsy();
    const searchBody = jsonOf(search);
    expect(searchBody.results[0].id).toBe("domain/fintech-payments");
    expect(searchBody.match).toBe("any-term");

    const get = await client.callTool({
      name: "taste_get",
      arguments: { ids: ["domain/fintech-payments", "direction/quiet-instrument"] },
    });
    const getBody = jsonOf(get);
    expect(getBody.count).toBe(2);
    expect(getBody.packs.map((pack: { id: string }) => pack.id)).toEqual([
      "domain/fintech-payments",
      "direction/quiet-instrument",
    ]);

    const guidelines = await client.callTool({
      name: "taste_guidelines",
      arguments: { severity: "error", limit: 5, format: "markdown" },
    });
    expect(textOf(guidelines)).toContain("**MUST FIX**");
  });

  it("returns Markdown when requested", async () => {
    const result = await client.callTool({
      name: "taste_get",
      arguments: { ids: "domain/developer-tools", format: "markdown" },
    });
    const markdown = textOf(result);
    expect(markdown).toContain("# Developer tools");
    expect(markdown).toContain("## Recommended directions");
    expect(markdown).toContain("taste_get");
    expect(markdown).not.toContain('"kind"');
  });

  it("returns actionable suggestions for a missing id", async () => {
    const result = await client.callTool({
      name: "taste_get",
      arguments: { ids: "domain/fintech-paymnts" },
    });
    const body = jsonOf(result);
    expect(body.count).toBe(0);
    expect(body.missing).toEqual(["domain/fintech-paymnts"]);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it("rejects invalid tool arguments at the schema boundary", async () => {
    const result = await client.callTool({
      name: "taste_search",
      arguments: { limit: 0 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/limit|greater than|invalid/i);
  });

  it("serves static resources and resource templates", async () => {
    const resources = await client.listResources();
    const uris = resources.resources.map((resource) => resource.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        "tastepro://catalog",
        "tastepro://taxonomy/domains",
        "tastepro://stats",
        "tastepro://skill",
      ]),
    );

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toEqual(
      expect.arrayContaining(["tastepro://pack/{+id}", "tastepro://guideline/{+id}"]),
    );

    const catalog = await client.readResource({ uri: "tastepro://catalog" });
    const catalogBody = JSON.parse(resourceText(catalog)) as {
      stats: { catalogEntries: number };
      domains: unknown[];
    };
    expect(catalogBody.stats.catalogEntries).toBe(873);
    expect(catalogBody.domains).toHaveLength(40);

    const skill = await client.readResource({ uri: "tastepro://skill" });
    expect(resourceText(skill)).toContain("# TastePro skill");

    const pack = await client.readResource({ uri: "tastepro://pack/domain/fintech-payments" });
    const packBody = JSON.parse(resourceText(pack)) as { id: string };
    expect(packBody.id).toBe("domain/fintech-payments");

    const guideline = await client.readResource({
      uri: "tastepro://guideline/guideline/focus-interactive-elements-need-visible-focus-focus-visible-ring-or-equivalent",
    });
    const guidelineBody = JSON.parse(resourceText(guideline)) as { id: string };
    expect(guidelineBody.id).toBe(
      "guideline/focus-interactive-elements-need-visible-focus-focus-visible-ring-or-equivalent",
    );
  });

  it("returns a useful not-found resource instead of crashing", async () => {
    const result = await client.readResource({ uri: "tastepro://pack/domain/nope" });
    expect(resourceText(result)).toMatch(/Pack not found/);
  });

  it("serves both design prompts", async () => {
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
      "design_audit",
      "design_brief",
    ]);

    const brief = await client.getPrompt({
      name: "design_brief",
      arguments: { project: "A fintech treasury dashboard", domain: "fintech-payments" },
    });
    expect(brief.messages).toHaveLength(1);
    expect(brief.messages[0]?.content.type).toBe("text");
    const text = brief.messages[0]?.content.type === "text" ? brief.messages[0].content.text : "";
    expect(text).toContain("taste_search");
    expect(text).toContain("fintech-payments");
    expect(text).toContain("accessibility");

    const audit = await client.getPrompt({
      name: "design_audit",
      arguments: { target: "https://example.com", focus: "accessibility" },
    });
    const auditText =
      audit.messages[0]?.content.type === "text" ? audit.messages[0].content.text : "";
    expect(auditText).toContain("taste_guidelines");
    expect(auditText).toContain("could not verify");
  });

  it("does not leak logs onto stdout", async () => {
    // If the server wrote logs to stdout, the JSON-RPC transport would have
    // failed before this point. This call is a final end-to-end proof.
    const result = await client.callTool({
      name: "taste_search",
      arguments: { query: "editorial", limit: 1 },
    });
    expect(result.isError).toBeFalsy();
  });
});
