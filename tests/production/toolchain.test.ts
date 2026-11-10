import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
  packageManager?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
};
const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
const gitignore = readFileSync(new URL(".gitignore", root), "utf8");

describe("Bun toolchain", () => {
  it("pins Bun and uses bun.lock as the only lockfile", () => {
    expect(pkg.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
    expect(pkg.engines?.bun).toBeTruthy();
    expect(existsSync(new URL("bun.lock", root))).toBe(true);
    expect(existsSync(new URL("package-lock.json", root))).toBe(false);
    expect(gitignore).not.toMatch(/^bun\.lock$/m);
  });

  it("runs project scripts without npm or npx", () => {
    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
      expect(script, name).not.toMatch(/\bnpm\b/);
      expect(script, name).not.toMatch(/\bnpx\b/);
    }
  });

  it("uses Bun in CI and audits dependencies", () => {
    expect(ci).toContain("oven-sh/setup-bun");
    expect(ci).toContain("bun ci");
    expect(ci).toContain("bun audit");
    expect(ci).not.toMatch(/\bnpm ci\b/);
    expect(ci).not.toMatch(/\bnpm run\b/);
  });
});
