import { createRequire } from "node:module";

declare const __TASTEPRO_VERSION__: string | undefined;

function resolveVersion(): string {
  if (typeof __TASTEPRO_VERSION__ === "string") return __TASTEPRO_VERSION__;
  const require = createRequire(import.meta.url);
  const packageJson = require("../package.json") as { version?: string };
  return packageJson.version ?? "0.0.0";
}

export const PACKAGE_NAME = "tastepro";
export const VERSION = resolveVersion();
export const SERVER_NAME = "tastepro";
