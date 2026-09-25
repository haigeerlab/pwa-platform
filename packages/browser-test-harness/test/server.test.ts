import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { request, type OutgoingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer, type FixtureServerOptions } from "../src/server.js";

type RawResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawHeaders: readonly string[];
  readonly body: string;
};

type SendOptions = { readonly host?: string; readonly headers?: OutgoingHttpHeaders };

/** Sends a request with the path exactly as given; unlike fetch, node:http does not normalize it. */
function send(server: FixtureServer, method: string, path: string, options: SendOptions = {}): Promise<RawResponse> {
  const port = Number(new URL(server.origin).port);
  return new Promise((resolveResponse, rejectResponse) => {
    const outgoing = request(
      { host: options.host ?? "127.0.0.1", port, method, path, ...(options.headers ? { headers: options.headers } : {}) },
      (incoming) => {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => (body += chunk));
        incoming.on("end", () =>
          resolveResponse({ status: incoming.statusCode ?? 0, headers: incoming.headers, rawHeaders: incoming.rawHeaders, body }),
        );
      },
    );
    outgoing.on("error", rejectResponse);
    outgoing.end();
  });
}

let base = "";
let servers: FixtureServer[] = [];

async function start(options: Partial<FixtureServerOptions> = {}): Promise<FixtureServer> {
  const server = await startFixtureServer({ versions: { v1: join(base, "v1"), v2: join(base, "v2") }, ...options });
  servers.push(server);
  return server;
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "pwa-harness-server-"));
  await mkdir(join(base, "outside"));
  await mkdir(join(base, "v1x"));
  await writeFile(join(base, "secret.txt"), "top secret");
  await writeFile(join(base, "outside", "other.txt"), "top secret too");
  await writeFile(join(base, "v1x", "secret.txt"), "sibling secret");
  const files: Record<string, string> = {
    "index.html": "<p>v1</p>",
    "sw.js": "// v1",
    "style.css": "p{}",
    "module.mjs": "export {};",
    "data.json": "{}",
    "app.webmanifest": "{}",
    "image.png": "png",
    "icon.svg": "<svg/>",
    "notes.txt": "notes",
    "blob.bin": "bin",
    "sub/index.html": "<p>sub</p>",
  };
  await mkdir(join(base, "v1", "sub"), { recursive: true });
  await mkdir(join(base, "v1", "empty"));
  for (const [name, content] of Object.entries(files)) await writeFile(join(base, "v1", name), content);
  await symlink(join(base, "secret.txt"), join(base, "v1", "link-file.txt"));
  await symlink(join(base, "outside"), join(base, "v1", "link-dir"));
  await symlink(join(base, "v1x", "secret.txt"), join(base, "v1", "sibling.txt"));
  await symlink(join(base, "v1", "notes.txt"), join(base, "v1", "alias.txt"));
  await mkdir(join(base, "v2"));
  await writeFile(join(base, "v2", "index.html"), "<p>v2</p>");
  await writeFile(join(base, "v2", "sw.js"), "// v2");
});

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers = [];
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("listening", () => {
  it("advertises a localhost origin and accepts loopback IPv4 connections", async () => {
    const server = await start();
    expect(server.origin).toMatch(/^http:\/\/localhost:\d+$/);
    expect((await send(server, "GET", "/")).status).toBe(200);
  });

  it("does not listen on the IPv6 loopback or other addresses", async () => {
    const server = await start();
    await expect(send(server, "GET", "/", { host: "::1" })).rejects.toThrow();
  });

  it("stops accepting connections after close", async () => {
    const server = await start();
    await server.close();
    servers = servers.filter((candidate) => candidate !== server);
    await expect(send(server, "GET", "/")).rejects.toThrow();
  });

  it("requires url paths to start with a slash", async () => {
    const server = await start();
    expect(server.url("/sw.js")).toBe(`${server.origin}/sw.js`);
    expect(() => server.url("sw.js")).toThrow();
  });
});

describe("host validation", () => {
  it("accepts its own localhost and 127.0.0.1 origins", async () => {
    const server = await start();
    const port = new URL(server.origin).port;
    for (const host of [`localhost:${port}`, `LOCALHOST:${port}`, `127.0.0.1:${port}`]) {
      expect((await send(server, "GET", "/", { headers: { host } })).status, host).toBe(200);
    }
  });

  it("rejects other hosts, such as a DNS-rebound name, with 403", async () => {
    const server = await start();
    const port = new URL(server.origin).port;
    for (const host of [`attacker.example:${port}`, `localhost.attacker.example:${port}`, "localhost:1", "localhost"]) {
      const response = await send(server, "GET", "/sw.js", { headers: { host } });
      expect(response.status, host).toBe(403);
      expect(response.body, host).toBe("");
    }
  });
});

describe("files", () => {
  it("serves index.html for directory paths with a trailing slash", async () => {
    const server = await start();
    expect((await send(server, "GET", "/")).body).toBe("<p>v1</p>");
    expect((await send(server, "GET", "/sub/")).body).toBe("<p>sub</p>");
  });

  it("redirects a directory path without a trailing slash, keeping the query", async () => {
    const server = await start();
    const response = await send(server, "GET", "/sub?from=test");
    expect(response.status).toBe(301);
    expect(response.headers["location"]).toBe("/sub/?from=test");
  });

  it("sets Content-Type by extension", async () => {
    const server = await start();
    const expected: Record<string, string> = {
      "/index.html": "text/html; charset=utf-8",
      "/sw.js": "text/javascript; charset=utf-8",
      "/module.mjs": "text/javascript; charset=utf-8",
      "/style.css": "text/css; charset=utf-8",
      "/data.json": "application/json; charset=utf-8",
      "/app.webmanifest": "application/manifest+json; charset=utf-8",
      "/image.png": "image/png",
      "/icon.svg": "image/svg+xml",
      "/notes.txt": "text/plain; charset=utf-8",
      "/blob.bin": "application/octet-stream",
    };
    for (const [path, contentType] of Object.entries(expected)) {
      expect((await send(server, "GET", path)).headers["content-type"], path).toBe(contentType);
    }
  });

  it("answers HEAD with headers only", async () => {
    const server = await start();
    const response = await send(server, "HEAD", "/sw.js");
    expect(response.status).toBe(200);
    expect(response.headers["content-length"]).toBe(String("// v1".length));
    expect(response.body).toBe("");
  });

  it("rejects methods other than GET and HEAD", async () => {
    const server = await start();
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
      const response = await send(server, method, "/sw.js");
      expect(response.status, method).toBe(405);
      expect(response.headers["allow"]).toBe("GET, HEAD");
    }
  });

  it("serves an explicitly declared non-file response without weakening the default method rejection", async () => {
    const server = await start({ responseRules: [{ method: "POST", path: "/api/orders", status: 201 }] });
    expect((await send(server, "POST", "/api/orders")).status).toBe(201);
    expect((await send(server, "POST", "/api/orders?source=retry")).status).toBe(201);
    expect((await send(server, "POST", "/api/other")).status).toBe(405);
    expect((await send(server, "PUT", "/api/orders")).status).toBe(405);
  });

  it("returns 404 for missing files and directories without an index", async () => {
    const server = await start();
    expect((await send(server, "GET", "/missing.js")).status).toBe(404);
    expect((await send(server, "GET", "/empty/")).status).toBe(404);
  });

  it("serves files only under their exact spelling, never outside the site or through aliases", async () => {
    const server = await start();
    const rejected = [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/sub/..%2f..%2fsecret.txt",
      "/%2E%2E%2F%2E%2E%2Fsecret.txt",
      "/link-file.txt",
      "/link-dir/other.txt",
      "/link-dir/",
      "/sibling.txt",
      "/alias.txt",
      "/notes.txt%00.html",
      "/%E0%A4%A",
      "/sub/..%2fsw.js",
      "/./sw.js",
      "/sub//index.html",
      "//sw.js",
      "/sub%5c..%5csw.js",
      "/SW.JS",
      "/Sub/",
    ];
    for (const path of rejected) {
      const response = await send(server, "GET", path);
      expect(response.status, path).toBe(404);
      expect(response.body, path).not.toContain("secret");
    }
  });

  it("never reaches the handler for a request target without a leading slash", async () => {
    const server = await start();
    // Node's HTTP parser answers 400 before the request handler runs, so nothing is served or recorded.
    expect((await send(server, "GET", "sw.js")).status).toBe(400);
    expect(server.requests()).toEqual([]);
  });
});

describe("header rules", () => {
  const rules = [
    { pathPrefix: "/", headers: { "Cache-Control": "max-age=60", "X-Rule": "root" } },
    { pathPrefix: "/sw.js", headers: { "cache-control": "no-cache" } },
  ];

  it("applies matching rules in order, later rules overriding header names case-insensitively", async () => {
    const server = await start({ headerRules: rules });
    const worker = await send(server, "GET", "/sw.js");
    expect(worker.headers["cache-control"]).toBe("no-cache");
    expect(worker.headers["x-rule"]).toBe("root");
    expect((await send(server, "GET", "/index.html")).headers["cache-control"]).toBe("max-age=60");
  });

  it("matches rules against the decoded path", async () => {
    const server = await start({ headerRules: [{ pathPrefix: "/sub/", headers: { "X-Sub": "yes" } }] });
    expect((await send(server, "GET", "/%73ub/")).headers["x-sub"]).toBe("yes");
    expect((await send(server, "GET", "/sw.js")).headers["x-sub"]).toBeUndefined();
  });

  it("sends one header line per value of an array", async () => {
    const server = await start({ headerRules: [{ pathPrefix: "/sw.js", headers: { "Cache-Control": ["no-cache", "immutable"] } }] });
    const response = await send(server, "GET", "/sw.js");
    const lines = response.rawHeaders.filter((_, index) => index % 2 === 0 && response.rawHeaders[index]?.toLowerCase() === "cache-control");
    expect(lines).toHaveLength(2);
    expect(response.headers["cache-control"]).toBe("no-cache, immutable");
  });

  it("replaces all rules at runtime", async () => {
    const server = await start({ headerRules: rules });
    server.setHeaderRules([]);
    expect((await send(server, "GET", "/sw.js")).headers["cache-control"]).toBeUndefined();
  });
});

describe("deployments", () => {
  it("starts with the first declared version and switches on deploy", async () => {
    const server = await start();
    expect(server.version).toBe("v1");
    expect((await send(server, "GET", "/sw.js")).body).toBe("// v1");
    server.deploy("v2");
    expect(server.version).toBe("v2");
    expect((await send(server, "GET", "/sw.js")).body).toBe("// v2");
    expect((await send(server, "GET", "/notes.txt")).status).toBe(404);
  });

  it("honours initialVersion and rejects unknown versions", async () => {
    const server = await start({ initialVersion: "v2" });
    expect((await send(server, "GET", "/sw.js")).body).toBe("// v2");
    expect(() => server.deploy("v3")).toThrow();
    expect(server.version).toBe("v2");
    await expect(start({ initialVersion: "v3" })).rejects.toThrow();
  });

  it("rejects versions that are not directories", async () => {
    await expect(startFixtureServer({ versions: { file: join(base, "secret.txt") } })).rejects.toThrow();
    await expect(startFixtureServer({ versions: {} })).rejects.toThrow();
  });
});

describe("range requests", () => {
  it("answers a satisfiable single range with a genuine 206 partial response", async () => {
    const server = await start();
    const response = await send(server, "GET", "/blob.bin", { headers: { range: "bytes=0-1" } });
    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe("bytes 0-1/3");
    expect(response.headers["content-length"]).toBe("2");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.body).toBe("bi");
  });

  it("answers an open-ended range (no end) with the rest of the body", async () => {
    const server = await start();
    const response = await send(server, "GET", "/blob.bin", { headers: { range: "bytes=1-" } });
    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe("bytes 1-2/3");
    expect(response.body).toBe("in");
  });

  it("answers an unsatisfiable range with 416 and Content-Range */size", async () => {
    const server = await start();
    const response = await send(server, "GET", "/blob.bin", { headers: { range: "bytes=10-20" } });
    expect(response.status).toBe(416);
    expect(response.headers["content-range"]).toBe("bytes */3");
  });

  it("leaves a request without Range unchanged: no Accept-Ranges, Content-Length still present, status 200", async () => {
    const server = await start();
    const response = await send(server, "GET", "/blob.bin");
    expect(response.status).toBe(200);
    expect(response.headers["accept-ranges"]).toBeUndefined();
    expect(response.headers["content-range"]).toBeUndefined();
    expect(response.headers["content-length"]).toBe("3");
    expect(response.body).toBe("bin");
  });
});

describe("request records", () => {
  it("records method, the raw path without its query, and time for every request", async () => {
    const server = await start();
    const before = Date.now();
    await send(server, "GET", "/sw.js?version=1");
    await send(server, "POST", "/submit");
    await send(server, "GET", "//attacker/sw.js");
    await send(server, "GET", "/sw.js", { headers: { host: "attacker.example" } });
    const records = server.requests();
    expect(records.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: "/sw.js" },
      { method: "POST", path: "/submit" },
      { method: "GET", path: "//attacker/sw.js" },
      { method: "GET", path: "/sw.js" },
    ]);
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(["method", "path", "time"]);
      expect(record.time).toBeGreaterThanOrEqual(before);
    }
    server.clearRequests();
    expect(server.requests()).toEqual([]);
  });
});
