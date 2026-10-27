import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { name?: string; version?: string };

export const PACKAGE_NAME = packageJson.name ?? "tastepro";
export const VERSION = packageJson.version ?? "0.0.0";
export const SERVER_NAME = "tastepro";
