import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".cache", "tests/fixtures/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts", "scripts/lib/**/*.ts"],
      exclude: ["src/cli.ts", "src/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
