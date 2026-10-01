import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAndroidSerial } from "../src/android.js";
import { exposeServer } from "../src/expose.js";
import { CLEANUP_PATH, closeReleasedIosProxies, describeIosSafari, iosCapabilities, lowestFreePort, markIosStorageFailed, parseMobileSafariPid, readIosDevice, readIosRestartEvery, restartReason, takeIosStorageFailed, readIosSessionTests, remoteAutomationHint, setIosNetworkOffline, setIosSessionOpen, startIosProxy, storageHealthError, trustIosTestCa } from "../src/ios.js";
import { readRealBrowserKind, requestedCapabilities } from "../src/webdriver.js";

const ENV = { PWA_IOS_UDID: "00008140-001E51203A81801C", PWA_IOS_LAN_IP: "192.168.100.71", PWA_IOS_TLS_DIR: "/tmp/tls" };

describe("readIosDevice", () => {
  it("is undefined when none of the three variables is set", () => {
    expect(readIosDevice({})).toBeUndefined();
    expect(readIosDevice({ PWA_IOS_UDID: "", PWA_IOS_LAN_IP: "", PWA_IOS_TLS_DIR: "" })).toBeUndefined();
  });

  it("returns the device when all three are set", () => {
    expect(readIosDevice(ENV)).toEqual({ udid: ENV.PWA_IOS_UDID, lanIp: "192.168.100.71", tlsDir: "/tmp/tls" });
  });

  it("names every missing variable when only some are set", () => {
    expect(() => readIosDevice({ PWA_IOS_UDID: "x" })).toThrow(/must be set together; missing: PWA_IOS_LAN_IP, PWA_IOS_TLS_DIR/);
    expect(() => readIosDevice({ ...ENV, PWA_IOS_TLS_DIR: "" })).toThrow(/missing: PWA_IOS_TLS_DIR/);
  });

  it("requires an IPv4 address", () => {
    expect(() => readIosDevice({ ...ENV, PWA_IOS_LAN_IP: "localhost" })).toThrow(/must be an IPv4 address/);
  });

  it("refuses to combine with another browser target", () => {
    expect(() => readIosDevice({ ...ENV, PWA_REAL_BROWSER: "safari" })).toThrow(/PWA_IOS_UDID and PWA_REAL_BROWSER cannot be combined/);
    expect(() => readIosDevice({ ...ENV, PWA_ANDROID_SERIAL: "4a1c64d0" })).toThrow(/PWA_IOS_UDID and PWA_ANDROID_SERIAL cannot be combined/);
    expect(() => readAndroidSerial({ ...ENV, PWA_ANDROID_SERIAL: "4a1c64d0" })).toThrow(/cannot be combined/);
    expect(() => readRealBrowserKind({ ...ENV, PWA_REAL_BROWSER: "firefox" })).toThrow(/cannot be combined/);
    expect(readIosDevice({ ...ENV, PWA_REAL_BROWSER: "", PWA_ANDROID_SERIAL: "" })).toBeDefined();
  });
});

describe("iPhone capabilities and identity", () => {
  it("reports a real Safari so every Safari based skip applies", () => {
    expect(readRealBrowserKind(ENV)).toBe("safari");
  });

  it("asks safaridriver for the device", () => {
    expect(iosCapabilities({ udid: "U", lanIp: "1.2.3.4", tlsDir: "/t" })).toEqual({ browserName: "safari", platformName: "iOS", "safari:deviceUDID": "U" });
    expect(requestedCapabilities("safari", ENV)).toEqual({ browserName: "safari", platformName: "iOS", "safari:deviceUDID": ENV.PWA_IOS_UDID });
    expect(requestedCapabilities("safari", {})).toEqual({ browserName: "safari" });
  });

  it("labels the session without the owner's device name", () => {
    const identity = describeIosSafari({
      browserVersion: "27.0.1",
      "safari:deviceName": "Someone's iPhone",
      "safari:deviceType": "iPhone",
      "safari:platformVersion": "27.0.1",
      "safari:platformBuildVersion": "24A446",
    });
    expect(identity).toEqual({ version: "27.0.1", label: "iPhone Safari 27.0.1 (iOS 27.0.1 build 24A446, USB WebDriver, LAN HTTPS)" });
    expect(describeIosSafari({}).label).toBe("iPhone Safari unknown (iOS unknown, USB WebDriver, LAN HTTPS)");
  });

  it("recognises iOS switching Remote Automation off", () => {
    expect(remoteAutomationHint("POST /session: session not created Remote Automation is turned off")).toMatch(/Not retrying/);
    expect(remoteAutomationHint("Safari is not configured to allow remote control")).toMatch(/Re-enable/);
    expect(remoteAutomationHint("connection refused")).toBeUndefined();
  });
});

describe("exposeServer", () => {
  it("is the plain localhost origin outside Android and iPhone runs", async () => {
    const exposed = await exposeServer(1234, {}, {});
    expect(exposed.origin).toBe("http://localhost:1234");
    await exposed.release();
    expect((await exposeServer(1234, { hostname: "127.0.0.1" }, {})).origin).toBe("http://127.0.0.1:1234");
  });
});

describe("iPhone HTTPS proxy", () => {
  let directory: string;
  let upstream: Server;
  let upstreamPort: number;
  const seen: { host: string | undefined; url: string | undefined }[] = [];

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "pwa-ios-proxy-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "server.key"), "-out", join(directory, "server.crt"), "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
    upstream = createServer((request, response) => {
      seen.push({ host: request.headers.host, url: request.url });
      if (request.url === "/redirect") {
        response.writeHead(301, { Location: `http://${request.headers.host}/target` }).end();
      } else if (request.url === "/relative") {
        response.writeHead(301, { Location: "/relative/" }).end();
      } else if (request.url === "/reset") {
        request.socket.destroy();
      } else if (request.url === "/held") {
        // never answered
      } else {
        response.writeHead(200, { "Content-Type": "text/plain", "X-Twice": ["a", "b"] }).end("hello");
      }
    });
    await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
    upstreamPort = (upstream.address() as AddressInfo).port;
  });

  afterAll(async () => {
    upstream.closeAllConnections();
    await new Promise((done) => upstream.close(done));
    rmSync(directory, { recursive: true, force: true });
  });

  function get(origin: string, path: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
    const cert = readFileSync(join(directory, "server.crt"));
    return new Promise((resolve, reject) => {
      httpsRequest(`${origin}${path}`, { ca: cert, checkServerIdentity: () => undefined, agent: false }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString() }));
      })
        .on("error", reject)
        .end();
    });
  }

  it("forwards over HTTPS with the upstream's own Host, rewrites absolute Location and keeps relative ones", async () => {
    const proxy = await startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: directory }, upstreamPort, { hostname: "localhost" });
    try {
      expect(proxy.origin).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
      const ok = await get(proxy.origin, "/page");
      expect(ok).toMatchObject({ status: 200, body: "hello" });
      expect(ok.headers["x-twice"]).toBe("a, b");
      expect(seen.at(-1)).toEqual({ host: `localhost:${upstreamPort}`, url: "/page" });
      expect((await get(proxy.origin, "/redirect")).headers["location"]).toBe(`${proxy.origin}/target`);
      expect((await get(proxy.origin, "/relative")).headers["location"]).toBe("/relative/");
    } finally {
      await proxy.release();
    }
  });

  it("answers the cleanup document itself, without asking the upstream", async () => {
    const proxy = await startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: directory }, upstreamPort, { hostname: "localhost" });
    try {
      const before = seen.length;
      const answer = await get(proxy.origin, CLEANUP_PATH);
      expect(answer.status).toBe(200);
      expect(answer.body).toContain("<title>cleanup</title>");
      expect(seen.length).toBe(before);
    } finally {
      await proxy.release();
    }
  });

  it("drops the client connection when the upstream resets, is gone or a held request is released", async () => {
    const proxy = await startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: directory }, upstreamPort, { hostname: "localhost" });
    try {
      await expect(get(proxy.origin, "/reset")).rejects.toThrow();
      const held = get(proxy.origin, "/held");
      held.catch(() => undefined);
      const settled = await Promise.race([held.then(() => "answered", () => "dropped"), new Promise((done) => setTimeout(() => done("still held"), 300))]);
      expect(settled).toBe("still held");
      upstream.closeAllConnections();
      await expect(held).rejects.toThrow();
    } finally {
      await proxy.release();
    }
    const gone = createServer();
    await new Promise<void>((done) => gone.listen(0, "127.0.0.1", done));
    const gonePort = (gone.address() as AddressInfo).port;
    await new Promise((done) => gone.close(done));
    const orphan = await startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: directory }, gonePort, { hostname: "localhost" });
    try {
      await expect(get(orphan.origin, "/anything")).rejects.toThrow();
    } finally {
      await orphan.release();
    }
  });

  it("cuts the network at every proxy for setIosNetworkOffline and restores it", async () => {
    const proxy = await startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: directory }, upstreamPort, { hostname: "localhost" });
    try {
      setIosNetworkOffline(true);
      await expect(get(proxy.origin, "/page")).rejects.toThrow();
      setIosNetworkOffline(false);
      expect((await get(proxy.origin, "/page")).status).toBe(200);
    } finally {
      setIosNetworkOffline(false);
      await proxy.release();
    }
  });

  it("trusts the test CA in Node when ca.crt is next to server.crt", () => {
    expect(trustIosTestCa({ udid: "U", lanIp: "127.0.0.1", tlsDir: join(directory, "missing") })).toBe(false);
  });

  it("keeps a released proxy up while a session is open, until the session has cleaned its origin", async () => {
    const proxy = await startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: directory }, upstreamPort, { hostname: "localhost" });
    setIosSessionOpen(true);
    await proxy.release();
    expect((await get(proxy.origin, CLEANUP_PATH)).status).toBe(200);
    setIosSessionOpen(false);
    await closeReleasedIosProxies();
    await expect(get(proxy.origin, CLEANUP_PATH)).rejects.toThrow();
  });

  it("serves from pool ports on the LAN address, frees a port on release and fails when the pool is exhausted", async () => {
    const free = createServer();
    await new Promise<void>((done) => free.listen(0, "127.0.0.1", done));
    const base = (free.address() as AddressInfo).port;
    await new Promise((done) => free.close(done));
    const pool = [base, base + 1];
    const device = { udid: "U", lanIp: "127.0.0.1", tlsDir: directory };
    const first = await startIosProxy(device, upstreamPort, { hostname: "localhost", ports: pool });
    const second = await startIosProxy(device, upstreamPort, { hostname: "localhost", ports: pool });
    expect([first.origin, second.origin]).toEqual([`https://127.0.0.1:${base}`, `https://127.0.0.1:${base + 1}`]);
    await expect(startIosProxy(device, upstreamPort, { hostname: "localhost", ports: pool })).rejects.toThrow(/No free port in the iPhone proxy pool/);
    await first.release();
    const third = await startIosProxy(device, upstreamPort, { hostname: "localhost", ports: pool });
    expect(third.origin).toBe(`https://127.0.0.1:${base}`);
    await second.release();
    await third.release();
  });

  it("explains an unreadable certificate directory", async () => {
    await expect(startIosProxy({ udid: "U", lanIp: "127.0.0.1", tlsDir: join(directory, "missing") }, upstreamPort, { hostname: "localhost" })).rejects.toThrow(/Cannot read .*server\.key \(PWA_IOS_TLS_DIR\)/);
  });
});

describe("proxy port pool", () => {
  it("allocates the lowest free port and reuses a released one", () => {
    expect(lowestFreePort([8443, 8441, 8442], new Set())).toBe(8441);
    expect(lowestFreePort([8441, 8442, 8443], new Set([8441, 8443]))).toBe(8442);
    expect(lowestFreePort([8441, 8442], new Set([8441, 8442]))).toBeUndefined();
  });
});

describe("restarting the phone's Safari", () => {
  const TABLE = [
    "PID    Path",
    "910    /System/Library/PrivateFrameworks/SafariSafeBrowsing.framework/com.apple.Safari.SafeBrowsing.Service",
    "3014   /private/var/containers/Bundle/Application/97B815C8/MobileSafari.app/MobileSafari",
    "3015   /private/preboot/Cryptexes/OS/System/Library/ExtensionKit/Extensions/NetworkingExtension.appex/com.apple.WebKit.Networking",
    "3022   /private/preboot/Cryptexes/App/usr/libexec/com.apple.Safari.History",
  ].join("\n");

  it("selects only the process whose path ends with /MobileSafari.app/MobileSafari", () => {
    expect(parseMobileSafariPid(TABLE)).toBe(3014);
    expect(parseMobileSafariPid(TABLE.replace("3014", "5467"))).toBe(5467);
  });

  it("finds nothing when MobileSafari is not running or only look-alikes are", () => {
    expect(parseMobileSafariPid("")).toBeUndefined();
    expect(parseMobileSafariPid(TABLE.split("\n").filter((line) => !line.includes("MobileSafari")).join("\n"))).toBeUndefined();
    expect(parseMobileSafariPid("77   /x/MobileSafari.app/MobileSafari.helper\n78   /x/NotMobileSafari.app/MobileSafari2")).toBeUndefined();
    expect(parseMobileSafariPid("79   /private/var/MobileSafari.app/com.apple.WebKit.WebContent")).toBeUndefined();
  });

  it("reads the restart interval, 100 by default", () => {
    expect(readIosRestartEvery({})).toBe(100);
    expect(readIosRestartEvery({ PWA_IOS_RESTART_EVERY: "" })).toBe(100);
    expect(readIosRestartEvery({ PWA_IOS_RESTART_EVERY: "40" })).toBe(40);
    for (const bad of ["0", "-3", "1.5", "often"]) expect(() => readIosRestartEvery({ PWA_IOS_RESTART_EVERY: bad })).toThrow(/positive integer/);
  });

  it("restarts after a failed health check at once, and otherwise once the interval is reached", () => {
    expect(restartReason({ testsSinceRestart: 3, every: 100, storageFailed: true })).toBe("storage health check failed");
    expect(restartReason({ testsSinceRestart: 99, every: 100, storageFailed: false })).toBeUndefined();
    expect(restartReason({ testsSinceRestart: 100, every: 100, storageFailed: false })).toBe("periodic restart");
    expect(restartReason({ testsSinceRestart: 100, every: 100, storageFailed: true })).toBe("storage health check failed");
  });

  it("remembers a failed health check until it is taken", () => {
    expect(takeIosStorageFailed()).toBe(false);
    markIosStorageFailed();
    expect(takeIosStorageFailed()).toBe(true);
    expect(takeIosStorageFailed()).toBe(false);
  });
});

describe("readIosSessionTests", () => {
  it("is 1 (a session per test) when unset or empty and a positive integer otherwise", () => {
    expect(readIosSessionTests({})).toBe(1);
    expect(readIosSessionTests({ PWA_IOS_SESSION_TESTS: "" })).toBe(1);
    expect(readIosSessionTests({ PWA_IOS_SESSION_TESTS: "1" })).toBe(1);
    expect(readIosSessionTests({ PWA_IOS_SESSION_TESTS: "25" })).toBe(25);
    for (const bad of ["0", "-1", "2.5", "many"]) expect(() => readIosSessionTests({ PWA_IOS_SESSION_TESTS: bad })).toThrow(/positive integer/);
  });
});

describe("storageHealthError", () => {
  it("is undefined when both storage kinds work", () => {
    expect(storageHealthError({ indexedDb: null, cacheStorage: null })).toBeUndefined();
  });

  it("names each failed storage kind and tells the owner what to do", () => {
    expect(storageHealthError({ indexedDb: "UnknownError: Unable to open database file on disk", cacheStorage: null })).toBe(
      "iPhone Safari storage is broken — force-quit Safari on the phone: IndexedDB (UnknownError: Unable to open database file on disk) failed",
    );
    expect(storageHealthError({ indexedDb: "a", cacheStorage: "b" })).toContain("IndexedDB (a) and Cache Storage (b) failed");
  });
});
