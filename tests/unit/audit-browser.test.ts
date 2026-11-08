import { describe, expect, it } from "vitest";
import {
  createPlaywrightRenderer,
  createRendererFromBrowser,
} from "../../src/server/audit-browser.js";

interface FakeRoute {
  pattern: string;
  handler: (route: { abort(): void }) => Promise<void> | void;
}

function fakeBrowser(overrides: { failSetContent?: boolean; hangSetContent?: boolean } = {}) {
  const state: {
    contextOptions?: { javaScriptEnabled?: boolean; serviceWorkers?: string };
    browserClosed: boolean;
    contextClosed: boolean;
    content: string;
    routes: FakeRoute[];
    aborted: boolean;
  } = {
    browserClosed: false,
    contextClosed: false,
    content: "",
    routes: [],
    aborted: false,
  };

  const page = {
    async setContent(html: string) {
      if (overrides.failSetContent) throw new Error("render failed");
      if (overrides.hangSetContent) return await new Promise<void>(() => {});
      state.content = html;
    },
    async evaluate() {
      return { horizontalOverflow: true };
    },
    async content() {
      return state.content.replace("<body>", '<body><div style="width: 4000px">wide</div>');
    },
  };
  const context = {
    async newPage() {
      return page;
    },
    async route(pattern: string, handler: FakeRoute["handler"]) {
      state.routes.push({ pattern, handler });
    },
    async close() {
      state.contextClosed = true;
    },
  };
  const browser = {
    async newContext(options: { javaScriptEnabled?: boolean; serviceWorkers?: string }) {
      state.contextOptions = options;
      return context;
    },
    async close() {
      state.browserClosed = true;
    },
  };
  return { browser, state };
}

describe("browser renderer", () => {
  it("renders with JavaScript disabled, blocks service workers, and aborts subresources", async () => {
    const { browser, state } = fakeBrowser();
    const renderer = createRendererFromBrowser(async () => browser);
    const result = await renderer("<html><body>ok</body></html>");

    expect(state.contextOptions).toEqual({
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]?.pattern).toBe("**/*");
    await state.routes[0]?.handler({
      abort() {
        state.aborted = true;
      },
    });
    expect(state.aborted).toBe(true);

    expect(state.browserClosed).toBe(true);
    expect(state.contextClosed).toBe(true);
    expect(result.layout?.horizontalOverflow).toBe(true);
    expect(result.html).toContain("4000px");
    expect(result.notes?.join(" ")).toMatch(/subresource requests are blocked/i);
  });

  it("times out a hung render and still closes the browser", async () => {
    const { browser, state } = fakeBrowser({ hangSetContent: true });
    const renderer = createRendererFromBrowser(async () => browser, { timeoutMs: 10 });
    await expect(renderer("<html></html>")).rejects.toThrow(/render timed out/i);
    expect(state.browserClosed).toBe(true);
  });

  it("closes the browser when rendering fails", async () => {
    const { browser, state } = fakeBrowser({ failSetContent: true });
    const renderer = createRendererFromBrowser(async () => browser);
    await expect(renderer("<html></html>")).rejects.toThrow(/render failed/);
    expect(state.browserClosed).toBe(true);
  });

  it("fails with an actionable error when playwright is absent", async () => {
    await expect(createPlaywrightRenderer()).rejects.toThrow(/playwright/i);
  });
});
