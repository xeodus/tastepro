import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackageJson {
  name: string;
  version: string;
  description: string;
  bin: Record<string, string>;
  files: string[];
  mcpName?: string;
  repository?: { type: string; url: string };
  publishConfig?: { access?: string; provenance?: boolean };
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
}

interface ServerJson {
  $schema: string;
  name: string;
  description: string;
  version: string;
  repository?: { url: string; source: string };
  packages: Array<{
    registryType: string;
    identifier: string;
    version?: string;
    transport: { type: string };
  }>;
}

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as PackageJson;
const server = JSON.parse(readFileSync(new URL("server.json", root), "utf8")) as ServerJson;
const dockerfile = readFileSync(new URL("Dockerfile", root), "utf8");
const cli = readFileSync(new URL("src/cli.ts", root), "utf8");

describe("npm package contract", () => {
  it("publishes the runtime entry point as a CLI", () => {
    expect(pkg.name).toBe("tastepro");
    expect(pkg.bin.tastepro).toBe("./dist/cli.js");
    expect(cli.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "content"]));
    expect(pkg.files).not.toContain("deploy");
  });

  it("carries the metadata npm and the MCP Registry require", () => {
    expect(pkg.mcpName).toBe("io.github.xeodus/tastepro");
    expect(pkg.repository?.url).toContain("github.com/xeodus/tastepro");
    expect(pkg.publishConfig).toEqual({ access: "public", provenance: true });
    expect(pkg.engines?.node).toBe(">=22");
  });

  it("ships prebuilt and installs no lifecycle scripts", () => {
    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.scripts?.preinstall).toBeUndefined();
    expect(pkg.scripts?.install).toBeUndefined();
    expect(pkg.scripts?.prepublishOnly).toContain("bun run build");
  });
});

describe("official registry contract", () => {
  it("matches the package version and name", () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.repository?.url).toBe("https://github.com/xeodus/tastepro");
    expect(server.repository?.source).toBe("github");
  });

  it("keeps the description within the registry limit", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it("lists both the npm and OCI artifacts", () => {
    const npm = server.packages.find((entry) => entry.registryType === "npm");
    expect(npm?.identifier).toBe("tastepro");
    expect(npm?.version).toBe(pkg.version);
    expect(npm?.transport.type).toBe("stdio");

    const oci = server.packages.find((entry) => entry.registryType === "oci");
    expect(oci?.identifier).toBe(`ghcr.io/xeodus/tastepro:${pkg.version}`);
    expect(oci?.transport.type).toBe("stdio");
    // The registry rejects a version field for OCI packages.
    expect(oci?.version).toBeUndefined();
  });

  it("labels the runtime image for OCI ownership verification", () => {
    expect(dockerfile).toContain(
      'LABEL io.modelcontextprotocol.server.name="io.github.xeodus/tastepro"',
    );
  });
});
