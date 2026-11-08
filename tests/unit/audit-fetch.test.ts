import { describe, expect, it } from "vitest";
import {
  type AuditFetchOptions,
  fetchAuditHtml,
  isPrivateAddress,
} from "../../src/server/audit-fetch.js";

const PUBLIC_LOOKUP = async () => [{ address: "93.184.216.34", family: 4 }];

function htmlResponse(body = "<html><body>ok</body></html>") {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function expectReject(
  url: string,
  options: AuditFetchOptions,
  pattern: RegExp,
): Promise<void> {
  await expect(fetchAuditHtml(url, options)).rejects.toThrow(pattern);
}

describe("audit URL guard", () => {
  it("classifies private and public addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "ff02::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("rejects non-HTTP schemes, credentials, and loopback names", async () => {
    await expectReject("file:///etc/passwd", { lookup: PUBLIC_LOOKUP }, /http/i);
    await expectReject("http://user:pass@example.com/", { lookup: PUBLIC_LOOKUP }, /credentials/i);
    await expectReject("http://localhost/", { lookup: PUBLIC_LOOKUP }, /private|loopback/i);
    await expectReject("http://127.0.0.1/", { lookup: PUBLIC_LOOKUP }, /private|loopback/i);
    await expectReject("http://[::1]/", { lookup: PUBLIC_LOOKUP }, /private|loopback/i);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    await expectReject(
      "https://internal.example/",
      { lookup: async () => [{ address: "10.0.0.5", family: 4 }] },
      /private/i,
    );
  });

  it("rejects a redirect into a private address before fetching it", async () => {
    let fetched = 0;
    const fetchImpl = async () => {
      fetched += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://10.0.0.5/secret" },
      });
    };
    await expectReject(
      "https://example.com/start",
      { lookup: PUBLIC_LOOKUP, fetchImpl },
      /private/i,
    );
    expect(fetched).toBe(1);
  });

  it("enforces content type, size, and timeout limits", async () => {
    await expectReject(
      "https://example.com/",
      {
        lookup: PUBLIC_LOOKUP,
        fetchImpl: async () =>
          new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      },
      /content type/i,
    );

    await expectReject(
      "https://example.com/",
      {
        lookup: PUBLIC_LOOKUP,
        maxBytes: 10,
        fetchImpl: async () => htmlResponse("a".repeat(100)),
      },
      /too large/i,
    );

    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    await expectReject(
      "https://example.com/",
      { lookup: PUBLIC_LOOKUP, fetchImpl, timeoutMs: 10 },
      /timed out/i,
    );
  });

  it("returns the document from a public host", async () => {
    const result = await fetchAuditHtml("https://example.com/", {
      lookup: PUBLIC_LOOKUP,
      fetchImpl: async () => htmlResponse(),
    });
    expect(result.finalUrl).toBe("https://example.com/");
    expect(result.contentType).toContain("text/html");
    expect(result.html).toContain("ok");
  });
});
