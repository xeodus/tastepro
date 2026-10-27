#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

interface LockSource {
  id: string;
  name: string;
  repo: string;
  commit: string;
  license: string;
  [key: string]: unknown;
}

interface SourceLock {
  version: number;
  generatedAt: string;
  sources: LockSource[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = resolve(ROOT, "sources.lock.json");

function repoSlug(repo: string): string {
  const match = repo.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Unsupported GitHub repo URL: ${repo}`);
  }
  return `${match[1]}/${match[2]}`;
}

async function githubJson<T>(url: string, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "tastepro-sources/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const reset = response.headers.get("x-ratelimit-reset");
      throw new Error(
        [
          `GitHub API rate limit or permission error (HTTP ${response.status}).`,
          remaining !== null ? `Remaining: ${remaining}.` : "",
          reset ? `Resets at ${new Date(Number(reset) * 1_000).toISOString()}.` : "",
          "Set GITHUB_TOKEN to raise the limit.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status} for ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function latestCommit(slug: string, token?: string): Promise<{ sha: string; date: string }> {
  const repo = await githubJson<{ default_branch: string }>(
    `https://api.github.com/repos/${slug}`,
    token,
  );
  const commit = await githubJson<{
    sha: string;
    commit: { committer?: { date?: string }; author?: { date?: string } };
  }>(
    `https://api.github.com/repos/${slug}/commits/${encodeURIComponent(repo.default_branch)}`,
    token,
  );
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) {
    throw new Error(`Unexpected commit SHA for ${slug}: ${commit.sha}`);
  }
  return {
    sha: commit.sha,
    date: commit.commit.committer?.date ?? commit.commit.author?.date ?? "",
  };
}

const program = new Command();
program
  .name("tastepro-sources")
  .description("Check pinned upstream sources for newer commits")
  .option("--write", "update sources.lock.json with the latest commits", false)
  .option("--source <id>", "only check one source id")
  .option("--json", "print a JSON report", false)
  .action(async (options) => {
    const raw = await readFile(LOCK_PATH, "utf8");
    const lock = JSON.parse(raw) as SourceLock;
    const selected = options.source
      ? lock.sources.filter((source) => source.id === options.source)
      : lock.sources;
    if (selected.length === 0) {
      throw new Error(`No source matched "${options.source}"`);
    }

    const token = process.env.GITHUB_TOKEN;
    const rows: Array<{
      id: string;
      current: string;
      latest: string;
      date: string;
      updated: boolean;
    }> = [];

    for (const source of selected) {
      const slug = repoSlug(source.repo);
      const latest = await latestCommit(slug, token);
      rows.push({
        id: source.id,
        current: source.commit,
        latest: latest.sha,
        date: latest.date,
        updated: latest.sha !== source.commit,
      });
    }

    if (options.write) {
      for (const row of rows) {
        const source = lock.sources.find((candidate) => candidate.id === row.id);
        if (source) source.commit = row.latest;
      }
      lock.generatedAt = new Date().toISOString().slice(0, 10);
      const temporary = `${LOCK_PATH}.tmp-${process.pid}`;
      await writeFile(temporary, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      await rename(temporary, LOCK_PATH);
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify({ write: Boolean(options.write), rows }, null, 2)}\n`);
    } else {
      for (const row of rows) {
        process.stdout.write(
          `${row.id.padEnd(24)} ${row.current.slice(0, 12)} -> ${row.latest.slice(0, 12)} ${row.updated ? "UPDATE" : "current"}${row.date ? `  ${row.date}` : ""}\n`,
        );
      }
      if (options.write) {
        process.stdout.write(
          "\nUpdated sources.lock.json. Run `npm run ingest -- --refresh` to re-ingest and regenerate content.\n",
        );
      } else if (rows.some((row) => row.updated)) {
        process.stdout.write(
          "\nPins are out of date. Re-run with --write, then `npm run ingest -- --refresh`.\n",
        );
      }
    }
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
