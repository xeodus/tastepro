import { type HTMLElement, type Node, parse } from "node-html-parser";

/**
 * Render an HTML/MDX fragment as structured plain text. Text nodes pass
 * through unchanged, so raw Markdown headings and lists survive; HTML
 * headings, paragraphs, and lists are normalized to Markdown. Script and
 * style contents are dropped.
 */
function renderNode(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  const element = node as HTMLElement;
  const tag = element.tagName?.toLowerCase() ?? "";
  if (tag === "script" || tag === "style") return "";
  const inner = (element.childNodes ?? []).map(renderNode).join("");
  if (tag === "h2") return `\n\n## ${inner.trim()}\n\n`;
  if (tag === "h3") return `\n\n### ${inner.trim()}\n\n`;
  if (tag === "h4") return `\n\n#### ${inner.trim()}\n\n`;
  if (tag === "li") return `\n- ${inner.trim()}`;
  if (tag === "p") return `\n\n${inner.trim()}\n\n`;
  if (tag === "br") return "\n";
  return inner;
}

export function htmlToText(html: string): string {
  const root = parse(html);
  const text = (root.childNodes ?? []).map(renderNode).join("");
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
