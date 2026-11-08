import type { AuditRenderer } from "../core/audit.js";

interface RouteLike {
  abort(): Promise<void> | void;
}

interface PageLike {
  setContent(html: string, options: { waitUntil: "load"; timeout?: number }): Promise<void>;
  evaluate(fn: () => { horizontalOverflow: boolean }): Promise<{ horizontalOverflow: boolean }>;
  content(): Promise<string>;
}

interface ContextLike {
  newPage(): Promise<PageLike>;
  route(pattern: string, handler: (route: RouteLike) => Promise<void> | void): Promise<void> | void;
  close(): Promise<void>;
}

interface BrowserLike {
  newContext(options: {
    javaScriptEnabled: boolean;
    serviceWorkers?: "block";
  }): Promise<ContextLike>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium?: {
    launch(options: { headless: boolean }): Promise<BrowserLike>;
  };
}

export type BrowserFactory = () => Promise<BrowserLike>;

const DEFAULT_RENDER_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Render submitted HTML in a browser with JavaScript disabled and every
 * subresource request aborted. The renderer never navigates to the input URL:
 * URL audits are fetched through the SSRF-guarded path first, then this
 * renderer receives the HTML. Aborting routes is what keeps an `<img>`,
 * stylesheet, font, or iframe in the submitted document from making a network
 * request. Timeouts bound a pathological document or a wedged browser.
 */
export function createRendererFromBrowser(
  factory: BrowserFactory,
  options: { timeoutMs?: number } = {},
): AuditRenderer {
  const timeoutMs = options.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  return async (html) => {
    const browser = await withTimeout(factory(), timeoutMs, "Browser launch timed out.");
    let context: ContextLike | undefined;
    try {
      context = await withTimeout(
        browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" }),
        timeoutMs,
        "Browser context creation timed out.",
      );
      await context.route("**/*", async (route) => {
        await route.abort();
      });
      const page = await withTimeout(
        context.newPage(),
        timeoutMs,
        "Browser page creation timed out.",
      );
      await withTimeout(
        page.setContent(html, { waitUntil: "load", timeout: timeoutMs }),
        timeoutMs,
        "Browser render timed out.",
      );
      const layout = await withTimeout(
        page.evaluate(() => {
          const doc = (
            globalThis as unknown as {
              document: { documentElement: { scrollWidth: number; clientWidth: number } };
            }
          ).document;
          return {
            horizontalOverflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
          };
        }),
        timeoutMs,
        "Browser layout evaluation timed out.",
      );
      const rendered = await withTimeout(
        page.content(),
        timeoutMs,
        "Browser content extraction timed out.",
      );
      return {
        html: rendered,
        layout,
        notes: [
          "JavaScript is disabled and all subresource requests are blocked; runtime behavior, hydration, and external assets are not rendered.",
        ],
      };
    } finally {
      if (context) {
        await withTimeout(
          context.close(),
          CLOSE_TIMEOUT_MS,
          "Browser context close timed out.",
        ).catch(() => undefined);
      }
      await withTimeout(browser.close(), CLOSE_TIMEOUT_MS, "Browser close timed out.").catch(
        () => undefined,
      );
    }
  };
}

export async function createPlaywrightRenderer(
  options: { timeoutMs?: number } = {},
): Promise<AuditRenderer> {
  const moduleName = "playwright";
  let playwright: PlaywrightModule;
  try {
    playwright = (await import(moduleName)) as PlaywrightModule;
  } catch {
    throw new Error(
      "Browser audit requires the optional playwright package. Install it with `npm install playwright` and `npx playwright install chromium`.",
    );
  }
  const chromium = playwright.chromium;
  if (!chromium) {
    throw new Error("Browser audit requires playwright's chromium browser.");
  }
  return createRendererFromBrowser(async () => chromium.launch({ headless: true }), options);
}
