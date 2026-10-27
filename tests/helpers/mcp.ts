import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

/** Join text resource contents and ignore binary blobs. */
export function resourceText(result: ReadResourceResult): string {
  return result.contents
    .map((content) => ("text" in content ? content.text : ""))
    .filter(Boolean)
    .join("\n");
}
