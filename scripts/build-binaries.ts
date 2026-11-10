import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface BuildResult {
  success: boolean;
  logs: unknown[];
}

interface BunBuild {
  build(options: Record<string, unknown>): Promise<BuildResult>;
}

const bun = (globalThis as { Bun?: BunBuild }).Bun;
if (!bun) throw new Error("Run with Bun: bun scripts/build-binaries.ts");

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const HOST_TARGETS: Record<string, string> = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "linux-arm64": "bun-linux-arm64",
  "linux-x64": "bun-linux-x64",
};

const host = `${process.platform}-${process.arch}`;
const hostTarget = HOST_TARGETS[host];
if (!hostTarget) throw new Error(`Unsupported host: ${host}`);

const targetArg = process.argv
  .find((arg) => arg.startsWith("--target="))
  ?.slice("--target=".length);
const targets = process.argv.includes("--all")
  ? ["bun-darwin-arm64", "bun-darwin-x64", "bun-linux-x64", "bun-linux-arm64"]
  : [targetArg ?? hostTarget];

mkdirSync("dist-bin", { recursive: true });

for (const target of targets) {
  const outfile = join("dist-bin", `tastepro-${target.replace(/^bun-/, "")}`);
  const result = await bun.build({
    entrypoints: ["./src/cli.ts"],
    compile: {
      target,
      outfile,
      assets: ["./content"],
    },
    define: {
      __TASTEPRO_VERSION__: JSON.stringify(pkg.version),
    },
    minify: true,
    sourcemap: "linked",
  });
  if (!result.success) {
    console.error(`Failed to build ${target}`);
    console.error(result.logs);
    process.exitCode = 1;
    continue;
  }
  console.log(`Built ${outfile}`);
}
