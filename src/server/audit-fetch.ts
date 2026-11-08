import { Buffer } from "node:buffer";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface AuditFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  fetchImpl?: typeof fetch;
}

export interface AuditFetchResult {
  html: string;
  finalUrl: string;
  contentType: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true;

  const mapped = normalized.match(/^::(?:ffff:)?(.+)$/);
  if (mapped) {
    const rest = mapped[1] ?? "";
    if (rest.includes(".")) {
      const octets = parseIpv4(rest);
      if (octets) return isPrivateIpv4(octets);
    } else if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(rest)) {
      const [high, low] = rest.split(":").map((part) => Number.parseInt(part, 16));
      const octets = [(high ?? 0) >> 8, (high ?? 0) & 0xff, (low ?? 0) >> 8, (low ?? 0) & 0xff];
      return isPrivateIpv4(octets);
    }
  }

  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (Number.isNaN(first)) return false;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  return (first & 0xff00) === 0xff00;
}

/**
 * Best-effort SSRF guard. It rejects private, loopback, link-local, CGNAT,
 * documentation, multicast, and reserved addresses. It is not a substitute for
 * network egress policy: URL fetching is opt-in and should run with outbound
 * firewall rules in production.
 */
export function isPrivateAddress(address: string): boolean {
  const cleaned = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const version = isIP(cleaned);
  if (version === 4) {
    const octets = parseIpv4(cleaned);
    return octets ? isPrivateIpv4(octets) : false;
  }
  if (version === 6) return isPrivateIpv6(cleaned);
  return false;
}

async function lookupAll(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return await dnsLookup(hostname, { all: true, verbatim: true });
}

async function assertPublicUrl(
  url: URL,
  lookup: (hostname: string) => Promise<Array<{ address: string; family: number }>>,
): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Audit URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new Error("Audit URL must not include credentials.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) throw new Error("Audit URL must include a host.");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    throw new Error(`Refusing to fetch a private or loopback host: ${hostname}.`);
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Refusing to fetch a private or loopback address: ${hostname}.`);
    }
    return;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname);
  } catch {
    throw new Error(`Could not resolve audit host: ${hostname}.`);
  }
  if (records.length === 0) throw new Error(`Could not resolve audit host: ${hostname}.`);
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error(`Refusing to fetch ${hostname}: it resolves to a private address.`);
    }
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Audit fetch response is too large (max ${maxBytes} bytes).`);
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`Audit fetch response is too large (max ${maxBytes} bytes).`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Audit fetch response is too large (max ${maxBytes} bytes).`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchAuditHtml(
  rawUrl: string,
  options: AuditFetchOptions = {},
): Promise<AuditFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const lookup = options.lookup ?? lookupAll;
  const doFetch = options.fetchImpl ?? fetch;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new Error("Audit URL is not a valid URL.");
  }

  for (let redirects = 0; ; redirects += 1) {
    await assertPublicUrl(current, lookup);

    let response: Response;
    try {
      response = await doFetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "tastepro-audit/0.1",
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new Error(`Audit fetch timed out after ${timeoutMs}ms.`);
      }
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `Audit fetch received a redirect without a location (HTTP ${response.status}).`,
        );
      }
      if (redirects >= maxRedirects) {
        throw new Error(`Audit fetch exceeded ${maxRedirects} redirects.`);
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Audit fetch failed with HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error(
        `Audit fetch expected an HTML content type, received "${contentType || "none"}".`,
      );
    }
    const html = await readLimited(response, maxBytes);
    return { html, finalUrl: current.toString(), contentType };
  }
}
