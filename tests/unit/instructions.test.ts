import { describe, expect, it } from "vitest";
import { SERVER_INSTRUCTIONS, SKILL_MARKDOWN } from "../../src/server/instructions.js";

describe("server instructions", () => {
  it("names the tools and the build sequence", () => {
    for (const tool of ["taste_search", "taste_get", "taste_guidelines"]) {
      expect(SERVER_INSTRUCTIONS).toContain(tool);
      expect(SKILL_MARKDOWN).toContain(tool);
    }
    expect(SERVER_INSTRUCTIONS).toMatch(/one direction/i);
    expect(SKILL_MARKDOWN).toContain("A good build sequence");
  });

  it("states the brand and attribution rules", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/Never impersonate a brand/);
    expect(SERVER_INSTRUCTIONS).toMatch(/Do not reproduce third-party screenshots/);
    expect(SERVER_INSTRUCTIONS).toMatch(/provenance/i);
    expect(SKILL_MARKDOWN).toMatch(/ATTRIBUTION\.md/);
    expect(SKILL_MARKDOWN).toMatch(/Apache-2\.0/);
    expect(SKILL_MARKDOWN).toMatch(/MIT/);
  });

  it("documents both transports", () => {
    expect(SKILL_MARKDOWN).toMatch(/stdio/);
    expect(SKILL_MARKDOWN).toMatch(/Streamable HTTP/);
    expect(SKILL_MARKDOWN).toContain("POST /mcp");
    expect(SKILL_MARKDOWN).toContain("/healthz");
  });

  it("is written for an agent rather than an end user", () => {
    expect(SKILL_MARKDOWN).toMatch(/coding agents/i);
    expect(SKILL_MARKDOWN).toMatch(/Do not blend five directions/i);
  });
});
