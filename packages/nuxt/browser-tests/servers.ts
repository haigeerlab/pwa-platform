// Serves a built Nitro node-server entry behind a small reverse proxy on a stable port, so "deploying" a new
// version — including the recovery build (T7b, spec decision 19: a real `recoveryRelease: true` build, not a
// post-build file swap) — never changes the origin the browser sees, only what answers behind it. Each `deploy`
// spawns its own backend on a fresh port and the proxy forwards to whichever one is current; the browser only ever
// sees the one, stable proxy port. `requests()` is also what offline.spec.ts and recovery.spec.ts use to prove the
// server received no (or exactly one) request.
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";

export type RequestRecord = {
  readonly method: string;
  /** Request target path without the query, exactly as the client sent it. */
  readonly path: string;
  readonly time: number;
};

export type DeployOptions = {
  readonly env?: Readonly<Record<string, string>>;
};

export type NuxtServer = {
  /** `http://127.0.0.1:<port>`: stable for the lifetime of this server across every `deploy`. */
  readonly origin: string;
  url(path: string): string;
  /** Requests that reached the proxy (which is every request the browser ever made), in arrival order. */
  requests(): readonly RequestRecord[];
  clearRequests(): void;
  /** Stops the current backend (if any) and starts `entry` as the new one, waiting until it answers requests. */
  deploy(entry: string, options?: DeployOptions): Promise<void>;
  /** Stops the current backend and the proxy itself. */
  close(): Promise<void>;
};

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address() as AddressInfo;
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitReady(origin: string, child: ChildProcess, deadlineMs = 30_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`nuxt node-server exited early with code ${child.exitCode}`);
    try {
      await fetch(origin);
      return;
    } catch {
      if (Date.now() >= deadline) throw new Error(`nuxt node-server did not become ready within ${deadlineMs} ms`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolveExit) => child.once("exit", resolveExit));
}

/** Starts the proxy (with no backend yet — call `deploy` before serving any test traffic). */
export async function startNuxtServer(): Promise<NuxtServer> {
  let child: ChildProcess | undefined;
  let backendPort = 0;
  let records: RequestRecord[] = [];

  const proxy = createHttpServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const target = request.url ?? "";
    const path = target.split("?", 1)[0] ?? "";
    records.push({ method: request.method ?? "", path, time: Date.now() });

    const upstream = httpRequest(
      { host: "127.0.0.1", port: backendPort, path: target, method: request.method, headers: request.headers },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  }

  const proxyPort = await new Promise<number>((resolveListen, rejectListen) => {
    proxy.once("error", rejectListen);
    proxy.listen(0, "127.0.0.1", () => {
      proxy.off("error", rejectListen);
      resolveListen((proxy.address() as AddressInfo).port);
    });
  });
  const origin = `http://127.0.0.1:${proxyPort}`;

  return {
    origin,
    url: (path) => `${origin}${path}`,
    requests: () => [...records],
    clearRequests: () => {
      records = [];
    },
    async deploy(entry, options) {
      await stopChild(child);
      backendPort = await getFreePort();
      child = spawn(process.execPath, [entry], {
        env: { ...process.env, ...options?.env, PORT: String(backendPort), HOST: "127.0.0.1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      await waitReady(`http://127.0.0.1:${backendPort}`, child);
    },
    async close() {
      await stopChild(child);
      await new Promise<void>((resolveClose, rejectClose) => {
        proxy.close((error) => (error ? rejectClose(error) : resolveClose()));
        proxy.closeAllConnections();
      });
    },
  };
}
