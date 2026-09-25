import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, sep } from "node:path";

export type HeaderRule = {
  /** Prefix of the decoded request path, for example `/sw.js` or `/assets/`. */
  readonly pathPrefix: string;
  /** Header values by name; an array sends one header line per value. */
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
};

/** An exact non-file response for one fixture request; unmatched methods still receive the static server's 405. */
export type FixtureResponseRule = {
  /** HTTP method in its wire spelling, for example `POST`. */
  readonly method: string;
  /** Request target path without the query, for example `/app/api/orders`. */
  readonly path: string;
  /** Complete HTTP status returned with an empty body. */
  readonly status: number;
};

export type FixtureServerOptions = {
  /** Site versions by name; each directory is served as the site root while its version is deployed. */
  readonly versions: Readonly<Record<string, string>>;
  /** Version served after start; defaults to the first declared version. */
  readonly initialVersion?: string;
  /** Applied in order to successful responses; a later rule overrides a header an earlier rule set. */
  readonly headerRules?: readonly HeaderRule[];
  /** Exact, empty-body responses for controlled non-file fixture requests. */
  readonly responseRules?: readonly FixtureResponseRule[];
};

export type RequestRecord = {
  readonly method: string;
  /** Request target path without the query, exactly as the client sent it. */
  readonly path: string;
  /** Milliseconds since the Unix epoch. */
  readonly time: number;
};

export type FixtureServer = {
  /** `http://localhost:<port>`: browsers treat localhost as a secure context, so workers can register. */
  readonly origin: string;
  /** Name of the version currently served. */
  readonly version: string;
  /** Absolute URL for a path that starts with `/`. */
  url(path: string): string;
  /** Switches the served site to another declared version, simulating a deployment. */
  deploy(version: string): void;
  setHeaderRules(rules: readonly HeaderRule[]): void;
  /** Requests that reached the server; bodies are never recorded. */
  requests(): readonly RequestRecord[];
  clearRequests(): void;
  close(): Promise<void>;
};

type Resolution =
  | { readonly kind: "file"; readonly file: string; readonly path: string }
  | { readonly kind: "redirect"; readonly location: string };

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

/**
 * Starts a static fixture server bound to 127.0.0.1 on a port chosen by the operating system. A file is served
 * only under its exact spelling: `..` or `.` segments, empty segments, backslashes, symlinks and case variants
 * all return 404, so header rules cannot be bypassed or applied to another file through an alias.
 */
export async function startFixtureServer(options: FixtureServerOptions): Promise<FixtureServer> {
  const roots = new Map<string, string>();
  for (const [name, directory] of Object.entries(options.versions)) {
    const root = await realpath(directory);
    if (!(await stat(root)).isDirectory()) throw new Error(`Fixture version "${name}" is not a directory: ${directory}`);
    roots.set(name, root);
  }
  const initialVersion = options.initialVersion ?? roots.keys().next().value;
  if (initialVersion === undefined || !roots.has(initialVersion)) {
    throw new Error(`Unknown initial fixture version: ${initialVersion ?? "(no versions declared)"}`);
  }

  let version = initialVersion;
  let headerRules: readonly HeaderRule[] = [...(options.headerRules ?? [])];
  const responseRules: readonly FixtureResponseRule[] = [...(options.responseRules ?? [])];
  let records: RequestRecord[] = [];
  let allowedHosts: ReadonlySet<string> = new Set();

  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const target = request.url ?? "";
    const path = target.split("?", 1)[0] ?? "";
    const method = request.method ?? "";
    records.push({ method, path, time: Date.now() });

    // Only this server's own origins: a DNS-rebound hostname must not read fixture files.
    if (!allowedHosts.has((request.headers.host ?? "").toLowerCase())) {
      response.writeHead(403).end();
      return;
    }
    const responseRule = responseRules.find((rule) => rule.method === method && rule.path === path);
    if (responseRule !== undefined) {
      response.writeHead(responseRule.status).end();
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const root = roots.get(version);
    const resolution = root === undefined ? undefined : await resolveRequest(root, path);
    if (resolution === undefined) {
      response.writeHead(404, { "Content-Type": CONTENT_TYPES[".txt"] }).end("Not found");
      return;
    }
    if (resolution.kind === "redirect") {
      response.writeHead(301, { Location: `${resolution.location}${target.slice(path.length)}` }).end();
      return;
    }

    const body = await readFile(resolution.file);
    const headers = new Map<string, readonly [string, string | string[]]>();
    const setHeader = (name: string, value: string | readonly string[]): void => {
      headers.set(name.toLowerCase(), [name, typeof value === "string" ? value : [...value]]);
    };
    setHeader("Content-Type", CONTENT_TYPES[extname(resolution.file).toLowerCase()] ?? "application/octet-stream");
    for (const rule of headerRules) {
      if (!resolution.path.startsWith(rule.pathPrefix)) continue;
      for (const [name, value] of Object.entries(rule.headers)) setHeader(name, value);
    }

    // A request without Range is answered exactly as before this block was added: no Accept-Ranges, no
    // Content-Range, the same Content-Length and status. Only a request that itself carries Range gets sliced, so a
    // Range-aware test can tell a real network 206 apart from a full-body one (ADR-0023, sw-runtime).
    const range = method === "GET" ? parseRange(request.headers.range, body.byteLength) : undefined;
    if (range === "unsatisfiable") {
      setHeader("Content-Range", `bytes */${body.byteLength}`);
      response.writeHead(416, Object.fromEntries(headers.values()));
      response.end();
      return;
    }
    if (range !== undefined) {
      const slice = body.subarray(range.start, range.end + 1);
      setHeader("Accept-Ranges", "bytes");
      setHeader("Content-Range", `bytes ${range.start}-${range.end}/${body.byteLength}`);
      setHeader("Content-Length", String(slice.byteLength));
      response.writeHead(206, Object.fromEntries(headers.values()));
      response.end(slice);
      return;
    }

    setHeader("Content-Length", String(body.byteLength));
    response.writeHead(200, Object.fromEntries(headers.values()));
    response.end(method === "HEAD" ? undefined : body);
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const port = (server.address() as AddressInfo).port;
  const origin = `http://localhost:${port}`;
  allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

  return {
    origin,
    get version() {
      return version;
    },
    url(path) {
      if (!path.startsWith("/")) throw new Error(`Fixture paths must start with "/": ${path}`);
      return `${origin}${path}`;
    },
    deploy(next) {
      if (!roots.has(next)) throw new Error(`Unknown fixture version: ${next}`);
      version = next;
    },
    setHeaderRules(rules) {
      headerRules = [...rules];
    },
    requests() {
      return [...records];
    },
    clearRequests() {
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

/** Parses a single `bytes=start-end` range header against a body of `size` bytes; only this common single-range form is supported. */
function parseRange(header: string | undefined, size: number): { readonly start: number; readonly end: number } | "unsatisfiable" | undefined {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d+)-(\d+)?$/.exec(header.trim());
  if (match?.[1] === undefined) return undefined;
  const start = Number(match[1]);
  const end = match[2] === undefined ? size - 1 : Number(match[2]);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

/** Decodes a request path, rejecting anything that is not a plain `/segment/segment` spelling. */
function decodePath(path: string): string | undefined {
  if (!path.startsWith("/")) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return undefined;
  const segments = decoded.slice(1).split("/");
  const valid = segments.every(
    (segment, index) => segment !== "." && segment !== ".." && (segment !== "" || index === segments.length - 1),
  );
  return valid ? decoded : undefined;
}

/** Resolves a request to a file whose real path is exactly the requested spelling, or a trailing-slash redirect. */
async function resolveRequest(root: string, path: string): Promise<Resolution | undefined> {
  const decoded = decodePath(path);
  if (decoded === undefined) return undefined;
  const directoryRequest = decoded.endsWith("/");
  const candidate = `${root}${decoded.split("/").join(sep)}${directoryRequest ? "index.html" : ""}`;
  try {
    const real = await realpath(candidate);
    if (real !== candidate) return undefined;
    const info = await stat(real);
    if (info.isFile()) return { kind: "file", file: real, path: decoded };
    if (info.isDirectory() && !directoryRequest) return { kind: "redirect", location: `${path}/` };
    return undefined;
  } catch {
    return undefined;
  }
}
