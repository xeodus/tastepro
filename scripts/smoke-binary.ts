#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const HOST_TARGETS: Record<string, string> = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "linux-arm64": "bun-linux-arm64",
  "linux-x64": "bun-linux-x64",
};
const target = HOST_TARGETS[`${process.platform}-${process.arch}`];
if (!target) throw new Error(`Unsupported host: ${process.platform}-${process.arch}`);

const binary = resolve(
  process.env.TASTEPRO_BINARY ?? `dist-bin/tastepro-${target.replace(/^bun-/, "")}`,
);

const version = execFileSync(binary, ["--version"], { encoding: "utf8", cwd: tmpdir() }).trim();
if (version !== pkg.version) {
  throw new Error(`Binary version ${version} does not match package ${pkg.version}`);
}

const info = JSON.parse(
  execFileSync(binary, ["info", "--json"], { encoding: "utf8", cwd: tmpdir() }),
) as {
  stats: { catalogEntries: number; contentHash: string };
};
if (info.stats.catalogEntries !== 873) {
  throw new Error(`Binary content has ${info.stats.catalogEntries} entries, expected 873`);
}

const transport = new StdioClientTransport({
  command: binary,
  args: ["--stdio"],
  cwd: tmpdir(),
  stderr: "pipe",
});
const client = new Client({ name: "binary-smoke", version: "0.1.0" }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
if (tools.tools.length !== 4) {
  throw new Error(`Binary exposed ${tools.tools.length} tools, expected 4`);
}

const search = await client.callTool({
  name: "taste_search",
  arguments: { query: "fintech palette", limit: 2 },
});
const searchBody = JSON.parse((search.content as Array<{ text?: string }>)[0]?.text ?? "{}") as {
  results?: Array<{ id?: string }>;
};
if (searchBody.results?.[0]?.id !== "domain/fintech-payments") {
  throw new Error("Binary search did not return domain/fintech-payments first");
}

const audit = await client.callTool({
  name: "taste_audit",
  arguments: { html: "<html><body><img src='/hero.png'></body></html>" },
});
const auditBody = JSON.parse((audit.content as Array<{ text?: string }>)[0]?.text ?? "{}") as {
  findings?: unknown[];
};
if ((auditBody.findings?.length ?? 0) === 0) {
  throw new Error("Binary audit returned no findings");
}

await client.close();
process.stdout.write(
  `Binary smoke passed: ${version}, ${info.stats.catalogEntries} entries, tools, search, audit\n`,
);
