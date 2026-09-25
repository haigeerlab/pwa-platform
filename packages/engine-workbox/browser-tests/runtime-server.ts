// A small, self-contained HTTP server for the runtime-cache browser tests. Unlike `@pwa-platform/browser-test-harness`'s
// `startFixtureServer` (which serves a static directory, one version at a time), these tests need per-request
// dynamic bodies (an incrementing counter, a controllable `Date` header, an oversized body) driven directly from
// the test, so each test gets its own server instance and — since the OS picks a fresh port — its own origin,
// which keeps Cache Storage isolated between tests without any manual cleanup.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type RuntimeRouteInfo = {
  /** Decoded path without the query string, exactly as registered with `route`. */
  readonly path: string;
  readonly query: URLSearchParams;
  /** 1-based count of requests this server has received for this exact path, including this one. */
  readonly count: number;
};

export type RuntimeRouteResult = {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
};

export type RuntimeRoute = (info: RuntimeRouteInfo) => RuntimeRouteResult;

export type RuntimeRequestRecord = { readonly method: string; readonly path: string };

export type RuntimeServer = {
  readonly origin: string;
  url(path: string): string;
  /** Content served at `/sw.js`; must be set (with the bundled worker) before a test registers it. */
  setWorkerScript(script: string): void;
  /** Registers or replaces the handler for an exact path (no query string). */
  route(path: string, handler: RuntimeRoute): void;
  requests(): readonly RuntimeRequestRecord[];
  clearRequests(): void;
  close(): Promise<void>;
};

const INDEX_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>runtime-cache fixture</title></head><body>ready</body></html>';

/** Starts a fresh server bound to 127.0.0.1 on an OS-assigned port; call `close()` when the test ends. */
export async function startRuntimeServer(): Promise<RuntimeServer> {
  const routes = new Map<string, RuntimeRoute>();
  const counts = new Map<string, number>();
  let workerScript = "// not set";
  let records: RuntimeRequestRecord[] = [];

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://internal.invalid");
    const path = url.pathname;
    records.push({ method: request.method ?? "", path });

    if (path === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(INDEX_HTML);
      return;
    }
    if (path === "/sw.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(workerScript);
      return;
    }
    const handler = routes.get(path);
    if (handler === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    const count = (counts.get(path) ?? 0) + 1;
    counts.set(path, count);
    const result = handler({ path, query: url.searchParams, count });
    response.writeHead(result.status, { "Content-Type": "text/plain; charset=utf-8", ...result.headers });
    response.end(result.body);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const port = (server.address() as AddressInfo).port;
  const origin = `http://localhost:${port}`;

  return {
    origin,
    url: (path) => `${origin}${path}`,
    setWorkerScript(script) {
      workerScript = script;
    },
    route(path, handler) {
      routes.set(path, handler);
    },
    requests: () => [...records],
    clearRequests: () => {
      records = [];
    },
    close() {
      return new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        server.closeAllConnections();
      });
    },
  };
}
