import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect, isIPv4, type AddressInfo, type Socket } from "node:net";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

/** Environment variables that run the browser suites in the Safari of a USB-connected iPhone (ADR-0049). */
export const IOS_UDID_ENV = "PWA_IOS_UDID";
export const IOS_LAN_IP_ENV = "PWA_IOS_LAN_IP";
export const IOS_TLS_DIR_ENV = "PWA_IOS_TLS_DIR";

type Env = Readonly<Record<string, string | undefined>>;

/** The iPhone target of a run: its UDID, this Mac's LAN address and the directory holding `server.key` / `server.crt`. */
export type IosDevice = { readonly udid: string; readonly lanIp: string; readonly tlsDir: string };

// Spelled out here (not imported) so that webdriver.ts, which asks `readIosDevice`, and android.ts can both import this file.
const OTHER_TARGET_ENVS = ["PWA_REAL_BROWSER", "PWA_ANDROID_SERIAL"] as const;

/**
 * Reads the iPhone target. `undefined` when none of the three variables is set; an error when only some are set, when
 * the address is not IPv4, or when another browser target (`PWA_REAL_BROWSER`, `PWA_ANDROID_SERIAL`) is also set.
 */
export function readIosDevice(env: Env): IosDevice | undefined {
  const names = [IOS_UDID_ENV, IOS_LAN_IP_ENV, IOS_TLS_DIR_ENV] as const;
  const values = names.map((name) => env[name] ?? "");
  if (values.every((value) => value === "")) return undefined;
  const missing = names.filter((_, index) => values[index] === "");
  if (missing.length > 0) throw new Error(`${names.join(", ")} must be set together; missing: ${missing.join(", ")}`);
  for (const other of OTHER_TARGET_ENVS) {
    if ((env[other] ?? "") !== "") throw new Error(`${IOS_UDID_ENV} and ${other} cannot be combined: choose one browser target per run`);
  }
  const [udid, lanIp, tlsDir] = values as [string, string, string];
  if (!isIPv4(lanIp)) throw new Error(`${IOS_LAN_IP_ENV} must be an IPv4 address, got "${lanIp}"`);
  return { udid, lanIp, tlsDir };
}

/**
 * Tests run on one WebDriver session before it is ended and a new one starts; default 1 (a session per test). Sharing
 * one session across tests made the next test's service worker install fail in about every other test (the worker was
 * dropped right after installing, observed in sw-runtime and vite on the phone), presumably because a worker that was
 * just unregistered at another port of the same IP still interferes; a fresh session starts with a fresh data store.
 */
export const IOS_SESSION_TESTS_ENV = "PWA_IOS_SESSION_TESTS";
export const IOS_DEFAULT_SESSION_TESTS = 1;

/** Reads `PWA_IOS_SESSION_TESTS`: a positive integer, `IOS_DEFAULT_SESSION_TESTS` when unset or empty; anything else is an error. */
export function readIosSessionTests(env: Env): number {
  const value = env[IOS_SESSION_TESTS_ENV] ?? "";
  if (value === "") return IOS_DEFAULT_SESSION_TESTS;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${IOS_SESSION_TESTS_ENV} must be a positive integer, got "${value}"`);
  return Number(value);
}

/** True when this run drives the Safari of an iPhone; specs use it for precise `test.skip` reasons. */
export function isIosRun(): boolean {
  return readIosDevice(process.env) !== undefined;
}

/** W3C `alwaysMatch` capabilities that make safaridriver drive the Safari of that iPhone. */
export function iosCapabilities(device: IosDevice): Record<string, unknown> {
  return { browserName: "safari", platformName: "iOS", "safari:deviceUDID": device.udid };
}

/**
 * Version and log label from the session capabilities, for example
 * `iPhone Safari 27.0.1 (iOS 27.0.1 build 24A446, USB WebDriver, LAN HTTPS)`. The owner's device name is never printed.
 */
export function describeIosSafari(capabilities: Readonly<Record<string, unknown>>): { readonly version: string; readonly label: string } {
  const text = (key: string): string | undefined => (typeof capabilities[key] === "string" && capabilities[key] !== "" ? (capabilities[key] as string) : undefined);
  const version = text("browserVersion") ?? "unknown";
  const device = text("safari:deviceType") ?? "iPhone";
  const build = text("safari:platformBuildVersion");
  const platform = `iOS ${text("safari:platformVersion") ?? "unknown"}${build === undefined ? "" : ` build ${build}`}`;
  return { version, label: `${device} Safari ${version} (${platform}, USB WebDriver, LAN HTTPS)` };
}

/**
 * Makes this Node process trust the test CA, so requests the specs make from Node (`fetch`, `page.request`) to a proxied
 * origin verify. Reads the public `ca.crt` if it sits next to `server.crt` in the TLS directory (the private key is never
 * read); without it those requests fail certificate verification and only the specs that make them are affected.
 * Returns whether a CA was added.
 */
export function trustIosTestCa(device: IosDevice): boolean {
  const file = join(device.tlsDir, "ca.crt");
  if (!existsSync(file)) return false;
  setDefaultCACertificates([...getCACertificates("default"), readFileSync(file, "utf8")]);
  return true;
}

/** Message added to a failed session creation when iOS turned Remote Automation off; retrying cannot fix it. */
export function remoteAutomationHint(message: string): string | undefined {
  return /Remote Automation is turned off|not configured to allow remote control/i.test(message)
    ? "iOS has Remote Automation switched off (Settings > Apps > Safari > Advanced); an unclean session end does that. Re-enable it on the phone, then run again (ADR-0049). Not retrying."
    : undefined;
}

/** Path the proxy answers itself with an empty same-origin document, so cleanup never depends on the upstream or a stall. */
export const CLEANUP_PATH = "/__pwa-harness-cleanup__";

/** What `iosCleanupScript` found left over after cleaning; both must be 0. */
export type CleanupReport = { readonly registrations: number; readonly caches: number };

/**
 * Runs in the page at the origin being cleaned: unregisters every service worker, deletes every cache, clears
 * localStorage, sessionStorage, IndexedDB and script-visible cookies, and reports what is still there afterwards.
 * A worker that controls the page may answer a navigation with an app shell that registers again, so it retries.
 */
export async function iosCleanupScript(): Promise<CleanupReport> {
  const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
  let registrations = 0;
  let caches = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ("serviceWorker" in navigator) {
      for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    }
    for (const name of await self.caches.keys()) await self.caches.delete(name);
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Storage disabled for this document: nothing to clear.
    }
    if ("databases" in indexedDB) {
      for (const database of await indexedDB.databases()) {
        if (database.name === undefined) continue;
        const name = database.name;
        await new Promise<void>((done) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => done();
          request.onerror = () => done();
          request.onblocked = () => done();
        });
      }
    }
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
    registrations = "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0;
    caches = (await self.caches.keys()).length;
    if (registrations === 0 && caches === 0) break;
    await sleep(200);
  }
  return { registrations, caches };
}

/** What `iosStorageProbeScript` found: an error text per storage kind, or `null` when it worked. */
export type StorageReport = { readonly indexedDb: string | null; readonly cacheStorage: string | null };

/**
 * Runs in a page at a proxied origin: opens and deletes an IndexedDB database, and opens, writes to and deletes a
 * cache, leaving nothing behind. Safari on the iPhone once lost the ability to do either after many sessions.
 */
export async function iosStorageProbeScript(): Promise<StorageReport> {
  const failure = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  let indexedDb: string | null = null;
  let cacheStorage: string | null = null;
  try {
    const name = `pwa-harness-health-${Date.now()}`;
    await new Promise<void>((done, fail) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("health");
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        request.result.close();
        const removal = indexedDB.deleteDatabase(name);
        removal.onsuccess = () => done();
        removal.onerror = () => fail(removal.error);
      };
    });
  } catch (error) {
    indexedDb = failure(error);
  }
  try {
    const name = `pwa-harness-health-${Date.now()}`;
    const cache = await self.caches.open(name);
    await cache.put("/pwa-harness-health", new Response("ok"));
    await self.caches.delete(name);
  } catch (error) {
    cacheStorage = failure(error);
  }
  return { indexedDb, cacheStorage };
}

/** The error to raise for a failed storage probe, or `undefined` when both storage kinds work. */
export function storageHealthError(report: StorageReport): string | undefined {
  const failed = [report.indexedDb === null ? undefined : `IndexedDB (${report.indexedDb})`, report.cacheStorage === null ? undefined : `Cache Storage (${report.cacheStorage})`].filter((part) => part !== undefined);
  return failed.length === 0 ? undefined : `iPhone Safari storage is broken — force-quit Safari on the phone: ${failed.join(" and ")} failed`;
}

type Exposure = { readonly origin: string; readonly prepareCleanup: () => void; setOffline(offline: boolean): void };
const liveExposures = new Set<Exposure>();

/** Origins that currently have an HTTPS proxy, for the per-test cleanup of `RealSession.cleanupOrigins`. */
export function liveIosOrigins(): readonly string[] {
  return [...liveExposures].map((exposure) => exposure.origin);
}

/** Puts the server behind `origin` into a state where the cleanup document can load (back online, stalls released). */
export function prepareIosOriginForCleanup(origin: string): void {
  for (const exposure of liveExposures) {
    if (exposure.origin !== origin) continue;
    exposure.setOffline(false);
    exposure.prepareCleanup();
  }
}

/**
 * The iPhone stand-in for `context.setOffline`: cuts (or restores) the network at every proxy. Open connections are
 * destroyed and new ones are dropped before a byte is read, so the phone gets network errors in the page and in
 * workers alike. Unlike Playwright's, `navigator.onLine` and the `online`/`offline` events stay as they are.
 */
export function setIosNetworkOffline(offline: boolean): void {
  for (const exposure of liveExposures) exposure.setOffline(offline);
}

let sessionOpen = false;
const released = new Set<() => Promise<void>>();

/** Set by the open iOS session: while it is open, a released proxy stays up until the session has cleaned its origin. */
export function setIosSessionOpen(open: boolean): void {
  sessionOpen = open;
}

/** Closes every proxy whose server was released while a session was open; call after cleaning their origins. */
export async function closeReleasedIosProxies(): Promise<void> {
  const closing = [...released];
  released.clear();
  await Promise.all(closing.map((close) => close()));
}

/** A server made reachable from the test browser: the origin tests must use, and the call that undoes it. */
export type ExposedServer = { readonly origin: string; release(): Promise<void> };

export type ProxyOptions = {
  /** Host name the upstream server expects in `Host` (`localhost` for the fixture servers, `127.0.0.1` for some others). */
  readonly hostname: string;
  /** Called before cleanup loads the cleanup document: bring the upstream back online and release held requests. */
  readonly prepareCleanup?: () => void;
};

/**
 * An HTTPS reverse proxy for the 127.0.0.1 server on `port`, listening only on the Mac's LAN address on a free port,
 * with the certificate in `device.tlsDir` that the iPhone trusts (ADR-0049). The upstream sees `Host: <hostname>:<port>`
 * and `Location` headers naming it are rewritten to the proxy origin. When the upstream cannot answer (offline, reset,
 * a held request released) the client socket is destroyed, so the phone gets a network error and not an HTTP 502.
 */
export async function startIosProxy(device: IosDevice, port: number, options: ProxyOptions): Promise<ExposedServer> {
  const tls = {
    key: readTls(device, "server.key"),
    cert: readTls(device, "server.crt"),
  };
  const upstreamHost = `${options.hostname}:${port}`;
  let origin = "";
  const sockets = new Set<Socket>();
  let offline = false;

  const proxy = createHttpsServer(tls, (request, response) => {
    if (request.url?.split("?", 1)[0] === CLEANUP_PATH) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end("<!doctype html><title>cleanup</title>");
      return;
    }
    const upstream = httpRequest(
      { host: "127.0.0.1", port, path: request.url, method: request.method, headers: forwardedHeaders(request.rawHeaders, upstreamHost), agent: false },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.statusMessage, rewriteLocation(answer.rawHeaders, `http://${upstreamHost}`, origin));
        answer.on("error", () => request.socket.destroy());
        answer.on("aborted", () => request.socket.destroy());
        answer.pipe(response);
      },
    );
    upstream.on("error", () => request.socket.destroy());
    response.once("close", () => {
      if (!response.writableFinished) upstream.destroy();
    });
    request.pipe(upstream);
  });

  proxy.on("connection", (socket: Socket) => {
    if (offline) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  // WebSocket and other upgrades (Vite HMR) are tunnelled byte for byte.
  proxy.on("upgrade", (request, client: Socket, head: Buffer) => {
    const upstream = connect(port, "127.0.0.1", () => {
      const lines = forwardedHeaders(request.rawHeaders, upstreamHost, true);
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${lines.reduce((text, value, index) => text + (index % 2 === 0 ? `${value}: ` : `${value}\r\n`), "")}\r\n`);
      if (head.length > 0) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.once("close", () => upstream.destroy());
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    proxy.once("error", rejectListen);
    proxy.listen(0, device.lanIp, () => {
      proxy.off("error", rejectListen);
      resolveListen();
    });
  });
  origin = `https://${device.lanIp}:${(proxy.address() as AddressInfo).port}`;
  const exposure: Exposure = {
    origin,
    prepareCleanup: options.prepareCleanup ?? (() => undefined),
    setOffline(next) {
      offline = next;
      if (next) for (const socket of sockets) socket.destroy();
    },
  };
  liveExposures.add(exposure);

  const close = async (): Promise<void> => {
    liveExposures.delete(exposure);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolveClose) => proxy.close(() => resolveClose()));
  };
  return {
    origin,
    async release() {
      // The test may keep using its page after its server is gone (the phone then sees network errors, as intended), and
      // the page's origin must be cleaned through this proxy: so a proxy released mid-session closes after that cleanup.
      if (sessionOpen) released.add(close);
      else await close();
    },
  };
}

function readTls(device: IosDevice, name: string): Buffer {
  const file = join(device.tlsDir, name);
  try {
    return readFileSync(file);
  } catch (error) {
    throw new Error(`Cannot read ${file} (${IOS_TLS_DIR_ENV}): ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection"]);

/** Flat `[name, value, ...]` request headers with `Host` replaced; hop-by-hop headers are dropped unless tunnelling an upgrade. */
function forwardedHeaders(raw: readonly string[], host: string, upgrade = false): string[] {
  const headers: string[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index] as string;
    const lower = name.toLowerCase();
    if (!upgrade && HOP_BY_HOP.has(lower)) continue;
    headers.push(name, lower === "host" ? host : (raw[index + 1] as string));
  }
  return headers;
}

/** Flat response headers with a `Location` that names the upstream rewritten to the proxy origin; hop-by-hop headers dropped. */
function rewriteLocation(raw: readonly string[], upstreamOrigin: string, proxyOrigin: string): string[] {
  const headers: string[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index] as string;
    const value = raw[index + 1] as string;
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    headers.push(name, name.toLowerCase() === "location" && value.startsWith(upstreamOrigin) ? `${proxyOrigin}${value.slice(upstreamOrigin.length)}` : value);
  }
  return headers;
}
