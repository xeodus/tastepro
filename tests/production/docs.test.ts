import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const install = read("docs/install.md");
const clients = read("docs/clients.md");
const readme = read("README.md");

describe("install documentation", () => {
  it("leads with the npm one-liner", () => {
    expect(install).toContain("npx -y tastepro");
    expect(readme).toContain("npx -y tastepro info");
    expect(install).toContain("claude mcp add tastepro -- npx -y tastepro --stdio");
  });

  it("covers every first-class client", () => {
    for (const client of ["Claude Code", "Codex", "OpenCode", "Cursor", "VS Code", "Zed"]) {
      expect(clients).toContain(client);
    }
  });

  it("does not emit the retired OpenCode V1 shape", () => {
    expect(clients).not.toContain('"enabled": true');
    expect(clients).not.toContain('"mcp": {\n    "tastepro"');
    expect(clients).toContain('"servers"');
    expect(clients).toContain('"disabled": false');
  });

  it("does not tell users to build from a checkout before installing", () => {
    expect(clients).not.toContain("/absolute/path/to/tastepro");
    expect(readme).not.toContain("When the package is published");
  });

  it("keeps the first-run command and its failure mode documented", () => {
    expect(install).toContain("tastepro audit");
    expect(install).toContain("--fail-on error");
    expect(install).toContain("--json");
  });
});
