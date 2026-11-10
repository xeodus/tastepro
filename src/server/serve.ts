export interface ServeOptions {
  fetch: (request: Request) => Response | Promise<Response>;
  hostname: string;
  port: number;
}

export interface ServeHandle {
  server: unknown;
  url: string;
  close: () => Promise<void>;
}

interface BunServerLike {
  port: number;
  stop(closeActiveConnections?: boolean): void | Promise<void>;
}

interface BunLike {
  serve(options: ServeOptions): BunServerLike;
}

function bunRuntime(): BunLike | undefined {
  const bun = (globalThis as { Bun?: BunLike }).Bun;
  return bun && typeof bun.serve === "function" ? bun : undefined;
}

export function formatServerUrl(hostname: string, port: number): string {
  return `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`;
}

/**
 * Start the HTTP server on the current runtime. Bun uses Bun.serve; Node uses
 * the Hono Node adapter. Both return the same handle so callers and tests do
 * not branch on the runtime.
 */
export async function serveHttp(options: ServeOptions): Promise<ServeHandle> {
  const bun = bunRuntime();
  if (bun) {
    const server = bun.serve(options);
    return {
      server,
      url: formatServerUrl(options.hostname, server.port),
      close: async () => {
        await server.stop(true);
      },
    };
  }

  const { serve } = await import("@hono/node-server");
  const server = serve(options);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", (error) => reject(error));
  });
  const address = server.address();
  const actualPort =
    address && typeof address === "object" && "port" in address ? address.port : options.port;
  return {
    server,
    url: formatServerUrl(options.hostname, actualPort),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      });
    },
  };
}
