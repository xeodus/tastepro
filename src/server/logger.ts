export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function formatFields(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) return "";
  const parts = Object.entries(fields).map(([key, value]) => {
    if (typeof value === "string") return `${key}=${JSON.stringify(value)}`;
    if (typeof value === "number" || typeof value === "boolean") return `${key}=${value}`;
    return `${key}=${JSON.stringify(value)}`;
  });
  return ` ${parts.join(" ")}`;
}

/**
 * Logs go to stderr by default. This is non-negotiable for stdio MCP: stdout is
 * the JSON-RPC channel and a single stray log line breaks the client.
 */
export function createLogger(
  level: LogLevel = "info",
  sink: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Logger {
  const threshold = level === "silent" ? Number.POSITIVE_INFINITY : LEVEL_ORDER[level];
  const log = (
    entryLevel: Exclude<LogLevel, "silent">,
    message: string,
    fields?: Record<string, unknown>,
  ) => {
    if (LEVEL_ORDER[entryLevel] < threshold) return;
    const timestamp = new Date().toISOString();
    sink(`${timestamp} ${entryLevel.toUpperCase()} ${message}${formatFields(fields)}`);
  };
  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}

export function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = (value ?? "info").toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error" ||
    normalized === "silent"
  ) {
    return normalized;
  }
  return "info";
}
