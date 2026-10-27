import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const children: ReturnType<typeof spawn>[] = [];

function run(args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, TASTEPRO_LOG_LEVEL: "silent", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
  }
});

describe("CLI", () => {
  it("prints its version and help", async () => {
    const version = await run(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toBe("0.1.0");

    const help = await run(["--help"]);
    expect(help.code).toBe(0);
    for (const command of ["info", "search", "get", "guidelines", "domains"]) {
      expect(help.stdout).toContain(command);
    }
    expect(help.stdout).toContain("--http");
    expect(help.stdout).toContain("--content-dir");
  });

  it("prints content info as JSON and human-readable text", async () => {
    const json = await run(["info", "--json"]);
    expect(json.code).toBe(0);
    const body = JSON.parse(json.stdout) as {
      stats: { catalogEntries: number; contentHash: string; warnings: string[] };
      sources: Array<{ id: string }>;
    };
    expect(body.stats.catalogEntries).toBe(873);
    expect(body.stats.contentHash).toHaveLength(64);
    expect(body.stats.warnings).toHaveLength(29);
    expect(body.sources.map((source) => source.id)).toContain("taste-skill");

    const human = await run(["info"]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Catalog entries: 873");
    expect(human.stdout).toContain("awesome-design-md");
    expect(human.stdout).toContain("Warnings: 29");
  });

  it("searches from the command line", async () => {
    const json = await run(["search", "fintech", "dashboard", "--json", "--limit", "2"]);
    expect(json.code).toBe(0);
    const body = JSON.parse(json.stdout) as {
      results: Array<{ id: string }>;
      total: number;
      matchedAllTerms: number;
    };
    expect(body.results[0]?.id).toBe("domain/fintech-payments");
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.matchedAllTerms).toBeGreaterThanOrEqual(1);

    const filtered = await run([
      "search",
      "editorial",
      "--kind",
      "direction",
      "--json",
      "--limit",
      "5",
    ]);
    const filteredBody = JSON.parse(filtered.stdout) as {
      results: Array<{ kind: string }>;
    };
    expect(filteredBody.results.every((card) => card.kind === "direction")).toBe(true);
  });

  it("fetches packs as JSON and Markdown", async () => {
    const json = await run(["get", "domain/fintech-payments", "--format", "brief"]);
    expect(json.code).toBe(0);
    const body = JSON.parse(json.stdout) as {
      count: number;
      packs: Array<{ id: string }>;
    };
    expect(body.count).toBe(1);
    expect(body.packs[0]?.id).toBe("domain/fintech-payments");

    const markdown = await run(["get", "direction/quiet-instrument", "--format", "markdown"]);
    expect(markdown.code).toBe(0);
    expect(markdown.stdout).toContain("# The quiet instrument");
    expect(markdown.stdout).toContain("## Idea");
  });

  it("queries guidelines and lists domains", async () => {
    const guidelines = await run(["guidelines", "focus", "--format", "markdown", "--limit", "3"]);
    expect(guidelines.code).toBe(0);
    expect(guidelines.stdout).toContain("# Web interface guidelines");
    expect(guidelines.stdout).toContain("- [ ]");

    const domains = await run(["domains", "--json"]);
    expect(domains.code).toBe(0);
    const body = JSON.parse(domains.stdout) as Array<{ id: string; launchTier: boolean }>;
    expect(body).toHaveLength(40);
    expect(body.filter((domain) => domain.launchTier)).toHaveLength(15);
  });

  it("rejects invalid filters and ports", async () => {
    const kind = await run(["search", "test", "--kind", "nope"]);
    expect(kind.code).toBe(1);
    expect(kind.stderr).toMatch(/Invalid kind/);

    const quality = await run(["search", "test", "--quality", "excellent"]);
    expect(quality.code).toBe(1);
    expect(quality.stderr).toMatch(/Invalid quality/);

    const source = await run(["search", "test", "--source", "nope"]);
    expect(source.code).toBe(1);
    expect(source.stderr).toMatch(/Invalid source/);

    const port = await run(["--http", "--port", "99999"]);
    expect(port.code).toBe(1);
    expect(port.stderr).toMatch(/Invalid port/);
  });

  it("starts the HTTP server, serves health, and shuts down cleanly", async () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli.ts",
        "--http",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--log-level",
        "info",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, TASTEPRO_LOG_LEVEL: "info" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.push(child);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), 15_000);
      const onData = () => {
        const match = stderr.match(/url="([^"]+)"/);
        if (match?.[1]) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stderr.on("data", onData);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited early with ${code}: ${stderr}`));
      });
    });

    try {
      const health = await fetch(`${url}/healthz`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { status: string; catalogEntries: number };
      expect(body.status).toBe("ok");
      expect(body.catalogEntries).toBe(873);
    } finally {
      child.kill("SIGTERM");
      const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => child.on("close", (code, signal) => resolve({ code, signal })),
      );
      expect(exit.signal).toBeNull();
      expect(exit.code).toBe(0);
    }
  }, 30_000);

  it("exits cleanly when stdio closes", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "--stdio"], {
      cwd: process.cwd(),
      env: { ...process.env, TASTEPRO_LOG_LEVEL: "silent" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.push(child);
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.stdin.end();
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("stdio process did not exit"));
        }, 5_000);
        child.on("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal });
        });
      },
    );
    expect(exit.signal).toBeNull();
    expect(exit.code).toBe(0);
  });
});
