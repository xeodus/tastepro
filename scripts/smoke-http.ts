#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createTasteProContext } from "../src/server/context.js";
import { startHttpServer } from "../src/server/http.js";
import { createLogger } from "../src/server/logger.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const apiKey = `smoke-${randomUUID()}`;
  const logger = createLogger("silent");
  const context = createTasteProContext();
  const running = await startHttpServer({
    context,
    host: "127.0.0.1",
    port: 0,
    apiKey,
    jsonResponse: true,
    logger,
  });
  const checks: string[] = [];
  try {
    const health = await fetch(`${running.url}/healthz`);
    assert(health.ok, `healthz returned ${health.status}`);
    const healthBody = (await health.json()) as { status?: string; catalogEntries?: number };
    assert(healthBody.status === "ok", "healthz status is not ok");
    assert(healthBody.catalogEntries === 873, "healthz catalog count is not 873");
    checks.push("healthz");

    const unauthorized = await fetch(`${running.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert(unauthorized.status === 401, `unauthenticated /mcp returned ${unauthorized.status}`);
    checks.push("auth");

    const transport = new StreamableHTTPClientTransport(new URL(`${running.url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    const client = new Client({ name: "tastepro-smoke", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    checks.push("initialize");

    const tools = await client.listTools();
    assert(tools.tools.length === 3, `expected 3 tools, got ${tools.tools.length}`);
    assert(
      tools.tools
        .map((tool) => tool.name)
        .sort()
        .join(",") === "taste_get,taste_guidelines,taste_search",
      "tool names are wrong",
    );
    checks.push("tools/list");

    const search = await client.callTool({
      name: "taste_search",
      arguments: { query: "fintech dashboard", limit: 3 },
    });
    const searchText = (search.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const searchBody = JSON.parse(searchText) as { results?: Array<{ id?: string }> };
    assert(
      searchBody.results?.[0]?.id === "domain/fintech-payments",
      `unexpected top search result: ${searchBody.results?.[0]?.id}`,
    );
    checks.push("taste_search");

    const get = await client.callTool({
      name: "taste_get",
      arguments: { ids: "domain/fintech-payments", format: "brief" },
    });
    const getText = (get.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    const getBody = JSON.parse(getText) as { count?: number; packs?: Array<{ id?: string }> };
    assert(getBody.count === 1, "taste_get did not return one pack");
    assert(getBody.packs?.[0]?.id === "domain/fintech-payments", "taste_get returned wrong pack");
    checks.push("taste_get");

    const guidelines = await client.callTool({
      name: "taste_guidelines",
      arguments: { query: "focus", format: "markdown", limit: 5 },
    });
    const guidelineText =
      (guidelines.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
    assert(guidelineText.includes("focus"), "guidelines markdown does not mention focus");
    checks.push("taste_guidelines");

    const resources = await client.listResources();
    assert(resources.resources.length >= 4, "expected at least four static resources");
    const skill = await client.readResource({ uri: "tastepro://skill" });
    const firstContent = skill.contents[0];
    const skillText = firstContent && "text" in firstContent ? firstContent.text : "";
    assert(skillText.includes("# TastePro skill"), "skill resource is wrong");
    checks.push("resources/read");

    const prompts = await client.listPrompts();
    assert(prompts.prompts.length === 2, `expected 2 prompts, got ${prompts.prompts.length}`);
    checks.push("prompts/list");

    await client.close();
    checks.push("close");
  } finally {
    await running.close();
  }

  process.stdout.write(`HTTP smoke passed: ${checks.join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
