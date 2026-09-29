// Serves the built `site-v3` fixture (runtime cache enabled) plus probe.html to a real phone or simulator.
// Usage: node serve.mjs [--port 8080] [--log ./server.log] [--root <site dir>]
// It is a manual verification aid, not a test: the page reports every step back through /__ctl?log=, so the
// result can be read from the log without looking at the phone.
import { appendFileSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const ROOT = resolve(args.get("--root") ?? join(here, "../../browser-build/site-v3"));
const PORT = Number(args.get("--port") ?? 8080);
const LOG = args.get("--log") ?? join(here, "server.log");
writeFileSync(LOG, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
};
// The same response shapes runtime-cache.spec.ts asserts on, applied per file name.
const HEADERS = {
  "reject-no-store.json": { "Cache-Control": "no-store" },
  "reject-private.json": { "Cache-Control": "private" },
  "reject-vary-cookie.json": { Vary: "Cookie" },
  "reject-wrong-mime.json": { "Content-Type": "text/plain; charset=utf-8" },
  "cookie-public.json": { "Set-Cookie": "sid=abc; Path=/" },
  "cookie-private.json": { "Set-Cookie": "sid=abc; Path=/", "Cache-Control": "private" },
};
// Bodies that change on every network hit, so the page can tell a network answer from a cached one.
const COUNTED = new Map([
  ["/app/api/catalog/items.json", "items"],
  ["/app/api/reviews/list.json", "list"],
]);

let offline = false;
let counters = { items: 0, list: 0 };
const write = (line) => appendFileSync(LOG, `${line}\n`);

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  // Control channel: never cut, so the page can always switch the "network" back on.
  if (path === "/__ctl") {
    if (url.searchParams.has("log")) write(`PAGE ${url.searchParams.get("log")}`);
    if (url.searchParams.has("offline")) {
      offline = url.searchParams.get("offline") === "1";
      write(`SERVER offline=${offline}`);
    }
    if (url.searchParams.has("reset")) {
      counters = { items: 0, list: 0 };
      write("SERVER reset counters");
    }
    response.writeHead(200).end("ok");
    return;
  }
  // Offline = the server resets the connection, so page and worker requests fail like a dead network.
  if (offline) {
    request.socket.destroy();
    return;
  }
  write(`${request.method} ${path}${request.headers.authorization ? " [auth]" : ""}`);

  const counter = COUNTED.get(path);
  if (counter !== undefined) {
    counters[counter] += 1;
    response.writeHead(200, { "Content-Type": TYPES[".json"] }).end(JSON.stringify({ n: counters[counter] }));
    return;
  }

  let file = path === "/app/probe.html" ? join(here, "probe.html") : join(ROOT, path);
  try {
    if ((await stat(file)).isDirectory()) {
      if (!path.endsWith("/")) {
        response.writeHead(301, { Location: `${path}/` }).end();
        return;
      }
      file = join(file, "index.html");
    }
    const body = await readFile(file);
    const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", ...HEADERS[file.split("/").pop()] };
    response.writeHead(200, headers).end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`listening on http://localhost:${PORT}/app/probe.html (root ${ROOT}, log ${LOG})`));
