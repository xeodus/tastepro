import { describe, expect, it } from "vitest";
import { createLogger, parseLogLevel } from "../../src/server/logger.js";

function capture(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line) => lines.push(line) };
}

describe("logger", () => {
  it("writes to stderr-style sinks with levels and fields", () => {
    const { lines, sink } = capture();
    const logger = createLogger("info", sink);
    logger.debug("hidden");
    logger.info("started", { version: "0.1.0", port: 3000, ok: true });
    logger.warn("careful", { reason: "test" });
    logger.error("failed", { error: "boom" });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/ INFO started version="0\.1\.0" port=3000 ok=true$/);
    expect(lines[1]).toMatch(/ WARN careful reason="test"$/);
    expect(lines[2]).toMatch(/ ERROR failed error="boom"$/);
    expect(lines.every((line) => /^\d{4}-\d{2}-\d{2}T/.test(line))).toBe(true);
  });

  it("suppresses messages below the threshold", () => {
    const { lines, sink } = capture();
    const logger = createLogger("error", sink);
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    expect(lines).toHaveLength(0);
    logger.error("d");
    expect(lines).toHaveLength(1);
  });

  it("can be silent", () => {
    const { lines, sink } = capture();
    const logger = createLogger("silent", sink);
    logger.error("nope");
    expect(lines).toHaveLength(0);
  });

  it("formats nested fields as JSON", () => {
    const { lines, sink } = capture();
    const logger = createLogger("debug", sink);
    logger.debug("nested", { data: { a: 1 } });
    expect(lines[0]).toContain('data={"a":1}');
  });

  it("parses log levels safely", () => {
    expect(parseLogLevel("DEBUG")).toBe("debug");
    expect(parseLogLevel("warn")).toBe("warn");
    expect(parseLogLevel("silent")).toBe("silent");
    expect(parseLogLevel("nonsense")).toBe("info");
    expect(parseLogLevel(undefined)).toBe("info");
  });
});
