import { test } from "@playwright/test";
import type { APIResponse, Browser, BrowserContext, Page, Response } from "@playwright/test";
import { spawnSync } from "node:child_process";
import {
  CLEANUP_PATH,
  describeIosSafari,
  iosCleanupScript,
  liveIosOrigins,
  prepareIosOriginForCleanup,
  readIosDevice,
  remoteAutomationHint,
  closeReleasedIosProxies,
  setIosSessionOpen,
  type CleanupReport,
} from "./ios.js";
import {
  correctedWindowSize,
  describeBrowser,
  isBrowserErrorPage,
  playwrightEngineName,
  requestedCapabilities,
  serializePageScript,
  startDriver,
  WebDriverSession,
  type BrowserIdentity,
  type DriverProcess,
  type RealBrowserKind,
} from "./webdriver.js";

const DEFAULT_WAIT_TIMEOUT = 30_000;
const DEFAULT_POLLING = 50;
/** How often `setViewportSize` re-measures and corrects the window for the browser's own chrome. */
const VIEWPORT_ATTEMPTS = 3;

/** Message prefix of every error a real-browser stand-in throws for a Playwright capability it does not implement. */
export function unsupportedMessage(kind: RealBrowserKind, member: string): string {
  return `Not supported on real browser (PWA_REAL_BROWSER=${kind}): ${member}`;
}

/**
 * Wraps `target` so that reading any member it does not implement yields a stand-in that throws the "Not supported"
 * error when called, and `page.request.get` style chains keep naming the full path. Nothing silently no-ops.
 */
function refuseUnimplemented<T extends object>(kind: RealBrowserKind, name: string, target: T): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === "symbol" || property === "then" || property in object) {
        return Reflect.get(object, property, receiver) as unknown;
      }
      return unsupportedStandIn(kind, `${name}.${property}`);
    },
  });
}

function unsupportedStandIn(kind: RealBrowserKind, path: string): unknown {
  return new Proxy(
    () => {
      throw new Error(unsupportedMessage(kind, path));
    },
    {
      get(_target, property) {
        if (typeof property === "symbol" || property === "then") return undefined;
        return unsupportedStandIn(kind, `${path}.${property}`);
      },
    },
  );
}

/**
 * The `Locator` subset the specs use, each operation a function run against `document.querySelector`. Every operation
 * hands its own function to `page.evaluate`: nothing here goes through `eval`, which a page's strict CSP blocks.
 */
class RealLocator {
  constructor(
    private readonly page: RealPage,
    private readonly selector: string,
  ) {}

  async textContent(): Promise<string | null> {
    return this.page.evaluate((selector: string) => document.querySelector(selector)?.textContent ?? null, this.selector);
  }

  async innerText(): Promise<string> {
    return this.page.evaluate((selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`No element matches ${selector}`);
      return (element as HTMLElement).innerText;
    }, this.selector);
  }

  async isVisible(): Promise<boolean> {
    return this.page.evaluate((selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
    }, this.selector);
  }

  async click(): Promise<void> {
    await this.page.evaluate((selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`No element matches ${selector}`);
      (element as HTMLElement).click();
    }, this.selector);
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.page.evaluate(
      ({ selector, attribute }) => document.querySelector(selector)?.getAttribute(attribute) ?? null,
      { selector: this.selector, attribute: name },
    );
  }

  async count(): Promise<number> {
    return this.page.evaluate((selector: string) => document.querySelectorAll(selector).length, this.selector);
  }
}

/** What the browser's Navigation Timing entry says about the document a `goto` loaded. */
type NavigationEvidence = { readonly status: number; readonly protocol: string; readonly url: string };

/**
 * The `Response` subset a navigation exposes over WebDriver, read from the page's own Navigation Timing entry (WebDriver
 * has no network events): the status, and whether a service worker answered. No headers and no body: asking for them
 * throws the "Not supported" error.
 */
/** Thrown by `RealResponse.status()` when the browser does not report the navigation's status (Safari 18.6). */
export class NavigationStatusUnavailableError extends Error {
  constructor() {
    super("The browser reported no response status for this navigation");
    this.name = "NavigationStatusUnavailableError";
  }
}

export class RealResponse {
  constructor(
    private readonly kind: RealBrowserKind,
    private readonly evidence: NavigationEvidence,
  ) {}

  status(): number {
    if (this.evidence.status === 0) throw new NavigationStatusUnavailableError();
    return this.evidence.status;
  }

  ok(): boolean {
    return this.status() >= 200 && this.status() <= 299;
  }

  url(): string {
    return this.evidence.url;
  }

  /**
   * True when the response carries no network timing (empty protocol), as for a response a worker built, read from a
   * cache or, in Firefox, relayed with `respondWith(fetch(...))`. `workerStart` is no evidence: Safari sets it whenever
   * a worker was merely consulted. Limit: Safari 18.6 reports a relayed response like a plain network one, so there
   * a relaying worker reads as `false` (Playwright reports `true`).
   */
  fromServiceWorker(): boolean {
    return this.evidence.protocol === "";
  }

  toPlaywright(): Response {
    return refuseUnimplemented(this.kind, "response", this) as unknown as Response;
  }
}

/** The `APIResponse` subset the specs use, from a Node-side request. */
class RealApiResponse {
  constructor(
    private readonly response: globalThis.Response,
    private readonly bytes: Buffer,
  ) {}

  status(): number {
    return this.response.status;
  }

  ok(): boolean {
    return this.response.ok;
  }

  /** Lower-cased names, like Playwright's; repeated headers are joined with a comma. */
  headers(): Record<string, string> {
    return Object.fromEntries(this.response.headers.entries());
  }

  async body(): Promise<Buffer> {
    return this.bytes;
  }

  async text(): Promise<string> {
    return this.bytes.toString("utf8");
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

/**
 * `page.request`: requests made from Node, straight to the server, so a page's service worker never sees them, exactly
 * like Playwright's `APIRequestContext`. Only `get` with `headers` is supported. Unlike Playwright's, it does not share
 * the browser's cookies (WebDriver session cookies are not read).
 */
export class RealApiRequestContext {
  async get(url: string, options: { readonly headers?: Record<string, string> } = {}): Promise<APIResponse> {
    const response = await fetch(url, { headers: options.headers ?? {} });
    return new RealApiResponse(response, Buffer.from(await response.arrayBuffer())) as unknown as APIResponse;
  }
}

/** True when `target` differs from `current` only by its fragment, which navigates without creating a new document. */
function sameDocumentFragment(current: string, target: string): boolean {
  try {
    const a = new URL(current);
    const b = new URL(target);
    a.hash = "";
    b.hash = "";
    return a.href === b.href && new URL(target).hash !== "";
  } catch {
    return false;
  }
}

type Size = { readonly width: number; readonly height: number };

/** The `Page` subset the specs use, on one tab of a WebDriver session. */
class RealPage {
  private closed = false;
  private lastUrl = "about:blank";
  private viewport: Size | null = null;

  constructor(
    private readonly kind: RealBrowserKind,
    private readonly session: WebDriverSession,
    readonly handle: string,
    private readonly owner: RealContext,
  ) {}

  /** Runs `step` with this tab as the session's current window, one step at a time across all pages of the session. */
  private inWindow<T>(step: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Target page has been closed"));
    return this.session.inWindow(this.handle, step);
  }

  /** Node-side requests that bypass the page's service worker (see `RealApiRequestContext`). */
  readonly request: RealApiRequestContext = new RealApiRequestContext();

  /** `keyboard.press` only (`Tab`, `Shift+Tab`, `Enter`, `Space`, arrows and single characters), as W3C key actions. */
  get keyboard(): { press(key: string): Promise<void> } {
    return refuseUnimplemented(this.kind, "page.keyboard", {
      press: async (key: string): Promise<void> => {
        if (this.closed) throw new Error("Target page has been closed");
        await this.session.pressKey(this.handle, key);
      },
    });
  }

  context(): BrowserContext {
    return this.owner as unknown as BrowserContext;
  }

  /**
   * Only `{ colorScheme: "light" | "dark" }`. Firefox forces it through its content colour-scheme preference and the
   * result is verified with `matchMedia`. Safari cannot emulate it: when the system appearance already is the requested
   * scheme this does nothing, otherwise the running test is skipped with that reason (never a silent pass).
   */
  async emulateMedia(options: { readonly colorScheme?: "light" | "dark" | null } & Record<string, unknown> = {}): Promise<void> {
    const given = Object.entries(options).filter(([, value]) => value !== undefined);
    const scheme = options.colorScheme;
    if (given.length !== 1 || given[0]?.[0] !== "colorScheme" || (scheme !== "light" && scheme !== "dark")) {
      throw new Error(unsupportedMessage(this.kind, `page.emulateMedia(${JSON.stringify(options)})`));
    }
    const current = (): Promise<"light" | "dark"> =>
      this.evaluate(() => (matchMedia("(prefers-color-scheme: dark)").matches ? ("dark" as const) : ("light" as const)));
    if (this.kind === "firefox") {
      await this.session.setFirefoxColorScheme(this.handle, scheme);
      const deadline = Date.now() + 5_000;
      while ((await current()) !== scheme) {
        if (Date.now() >= deadline) throw new Error(`Firefox did not switch prefers-color-scheme to ${scheme}`);
        await this.waitForTimeout(DEFAULT_POLLING);
      }
      return;
    }
    const actual = await current();
    if (actual !== scheme) {
      test.skip(true, `Safari cannot emulate prefers-color-scheme; system appearance is ${actual} — rerun with the other macOS appearance (R7.7)`);
    }
  }

  /**
   * Resizes the window until the page's `innerWidth` x `innerHeight` equal `size`, correcting for the browser's own
   * chrome (at most three measure-and-adjust rounds). A browser with a minimum window size ends larger than asked:
   * `viewportSize()` reports what was really achieved, never the request.
   */
  async setViewportSize(size: Size): Promise<void> {
    const measure = (): Promise<Size> => this.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    // iOS Safari has no window to resize (`setWindowRect: false`): report the size it has, like a browser with a minimum size.
    if (this.session.capabilities["setWindowRect"] === false) {
      this.viewport = await measure();
      return;
    }
    let outer = await this.session.windowRect(this.handle);
    let inner = await measure();
    for (let attempt = 0; attempt < VIEWPORT_ATTEMPTS && (inner.width !== size.width || inner.height !== size.height); attempt += 1) {
      const next = await this.session.setWindowRect(this.handle, correctedWindowSize(size, outer, inner));
      const unchanged = next.width === outer.width && next.height === outer.height;
      outer = next;
      inner = await measure();
      if (unchanged) break;
    }
    this.viewport = inner;
  }

  /** The viewport measured by the last `setViewportSize`; `null` before one (unlike Playwright's, it is not measured on demand). */
  viewportSize(): Size | null {
    return this.viewport;
  }

  /**
   * Navigates and resolves once the document has loaded; options such as `waitUntil` are ignored. The response has
   * `status()`, `ok()`, `url()` and `fromServiceWorker()` only, taken from the loaded document's Navigation Timing entry.
   */
  async goto(url: string): Promise<Response> {
    // iOS Safari answers a navigation that a controlling worker fails closed by keeping the previous document, with no
    // error page and no error from the driver. A new document has a new `timeOrigin`; one that did not change (and is
    // not a mere fragment navigation) means the navigation never happened, which Playwright reports as a rejection.
    const ios = this.session.capabilities["platformName"] === "iOS";
    const before = ios ? await this.evaluate(() => ({ origin: performance.timeOrigin, href: location.href })) : undefined;
    this.lastUrl = await this.inWindow(async () => {
      await this.session.navigate(url);
      return this.session.url();
    });
    const evidence = await this.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        status: entry?.responseStatus ?? 0,
        protocol: entry?.nextHopProtocol ?? "unknown",
        url: location.href,
      };
    });
    // Playwright rejects a navigation that fails to load; Safari's driver reports success and shows its error page
    // (whose URL only the page itself reports: Get Current URL still names the failed address).
    if (isBrowserErrorPage(evidence.url)) throw new Error(`page.goto: net::ERR_FAILED at ${url} (the browser showed its error page)`);
    if (before !== undefined && !sameDocumentFragment(before.href, url)) {
      const after = await this.evaluate(() => performance.timeOrigin);
      if (after === before.origin) throw new Error(`page.goto: net::ERR_FAILED at ${url} (the browser kept the previous document)`);
    }
    return new RealResponse(this.kind, evidence).toPlaywright();
  }

  async title(): Promise<string> {
    return this.evaluate(() => document.title);
  }

  /** Adds a classic `<script src>` to the page and resolves once it has loaded; only the `url` option is supported. */
  async addScriptTag(options: { readonly url: string }): Promise<void> {
    await this.evaluate(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = url;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load script ${url}`));
          document.head.append(script);
        }),
      options.url,
    );
  }

  /** Synchronous like Playwright's: the URL after the last goto, reload or evaluate on this page. */
  url(): string {
    return this.lastUrl;
  }

  async reload(): Promise<null> {
    if (this.closed) throw new Error("Target page has been closed");
    await this.session.reload(this.handle);
    this.lastUrl = await this.inWindow(() => this.session.url());
    return null;
  }

  /** Runs a function (called with `arg`) or an expression in the page; the result must be JSON-serializable. */
  async evaluate<R, A = undefined>(target: string | ((arg: A) => R | Promise<R>), arg?: A): Promise<R> {
    if (this.closed) throw new Error("Target page has been closed");
    return (await this.session.evaluate(this.handle, serializePageScript(target as string | ((arg: never) => unknown), arg), (href) => {
      this.lastUrl = href;
    })) as R;
  }

  /** Polls `target` until it returns a truthy value; unlike Playwright's default it never uses `requestAnimationFrame`. */
  async waitForFunction<R, A = undefined>(
    target: string | ((arg: A) => R | Promise<R>),
    arg?: A,
    options: { readonly timeout?: number; readonly polling?: number | "raf" } = {},
  ): Promise<R> {
    const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT;
    const polling = typeof options.polling === "number" ? options.polling : DEFAULT_POLLING;
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await this.evaluate(target, arg);
      if (value) return value;
      if (Date.now() >= deadline) throw new Error(`page.waitForFunction: Timeout ${timeout}ms exceeded.`);
      await this.waitForTimeout(polling);
    }
  }

  async waitForTimeout(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  locator(selector: string): RealLocator {
    return new RealLocator(this, selector);
  }

  async bringToFront(): Promise<void> {
    await this.inWindow(async () => undefined);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.inWindow(async () => {
      this.closed = true;
      const remaining = await this.session.closeWindow();
      const next = remaining[0];
      if (next !== undefined) await this.session.switchTo(next);
    });
    this.owner.forget(this);
  }

  isClosed(): boolean {
    return this.closed;
  }

  toPlaywright(): Page {
    return refuseUnimplemented(this.kind, "page", this) as unknown as Page;
  }
}

/** The `BrowserContext` subset the specs use: one WebDriver session, whose tabs are its pages. */
export class RealContext {
  private readonly pages: RealPage[] = [];

  constructor(
    private readonly kind: RealBrowserKind,
    private readonly session: WebDriverSession,
  ) {}

  /** Adopts the session's initial tab as the first page. */
  async firstPage(): Promise<Page> {
    const page = new RealPage(this.kind, this.session, this.session.currentHandle(), this);
    this.pages.push(page);
    return page.toPlaywright();
  }

  /** Opens a new tab in the same session. */
  async newPage(): Promise<Page> {
    const handle = await this.session.newTab();
    const page = new RealPage(this.kind, this.session, handle, this);
    this.pages.push(page);
    await page.bringToFront();
    return page.toPlaywright();
  }

  forget(page: RealPage): void {
    const index = this.pages.indexOf(page);
    if (index >= 0) this.pages.splice(index, 1);
  }

  toPlaywright(): BrowserContext {
    return refuseUnimplemented(this.kind, "context", this) as unknown as BrowserContext;
  }
}

/** A started real browser: its driver process, the identity it reported and the capabilities for new sessions. */
export class RealBrowser {
  constructor(
    readonly kind: RealBrowserKind,
    private readonly driver: DriverProcess,
    readonly identity: BrowserIdentity,
    private readonly capabilities: Record<string, unknown>,
  ) {}

  /** Starts the driver and reads the browser's identity from a short-lived probe session. */
  static async start(kind: RealBrowserKind, env: Readonly<Record<string, string | undefined>>): Promise<RealBrowser> {
    const driver = await startDriver(kind);
    try {
      const capabilities = requestedCapabilities(kind, env);
      const probe = await WebDriverSession.create(driver.baseUrl, capabilities);
      const identity = readIosDevice(env) === undefined ? describeBrowser(kind, probe.capabilities) : describeIosSafari(probe.capabilities);
      await probe.quit();
      return new RealBrowser(kind, driver, identity, capabilities);
    } catch (error) {
      await driver.stop();
      const hint = error instanceof Error ? remoteAutomationHint(error.message) : undefined;
      throw hint === undefined ? error : new Error(`${(error as Error).message} -- ${hint}`, { cause: error });
    }
  }

  /** Real version from the session capabilities, for example `18.6`. */
  version(): string {
    return this.identity.version;
  }

  /** `webkit` for Safari and `firefox` for Firefox, so existing `browserName` based skips keep working. */
  browserType(): { name(): string } {
    return { name: () => playwrightEngineName(this.kind) };
  }

  /** Sessions started and not yet ended; ended before the driver stops, because iOS turns Remote Automation off otherwise. */
  private readonly open = new Set<WebDriverSession>();

  /** Starts a new session (one browser instance state) with a context and its first page. */
  async openSession(): Promise<RealSession> {
    const session = await WebDriverSession.create(this.driver.baseUrl, this.capabilities);
    this.open.add(session);
    trackForExit(session);
    const context = new RealContext(this.kind, session);
    const ios = readIosDevice(process.env) !== undefined;
    if (ios) setIosSessionOpen(true);
    return {
      context: context.toPlaywright(),
      page: await context.firstPage(),
      cleanupOrigins: async (origins = liveIosOrigins()) => {
        await cleanupOrigins(session, origins);
        await closeReleasedIosProxies();
      },
      quit: async () => {
        this.open.delete(session);
        try {
          await session.quit();
        } finally {
          untrackForExit(session);
          if (ios) {
            setIosSessionOpen(false);
            await closeReleasedIosProxies();
          }
        }
      },
    };
  }

  async close(): Promise<void> {
    for (const session of this.open) await session.quit().catch(() => undefined);
    this.open.clear();
    await this.driver.stop();
  }

  toPlaywright(): Browser {
    return refuseUnimplemented(this.kind, "browser", this) as unknown as Browser;
  }
}

export type RealSession = {
  readonly context: BrowserContext;
  readonly page: Page;
  /**
   * iPhone runs (ADR-0049): closes every tab but one, then, in each origin (default: every origin with a proxy right
   * now), unregisters all service workers and deletes all caches, localStorage, sessionStorage and IndexedDB, throwing
   * if anything is left. Run before `quit` so the owner's Safari keeps nothing from a test.
   */
  cleanupOrigins(origins?: readonly string[]): Promise<void>;
  quit(): Promise<void>;
};

const unended = new Set<WebDriverSession>();
let exitHookInstalled = false;

/**
 * Last resort for a worker that dies with a session open: an `exit` handler may only run synchronous code, so it
 * sends the DELETE with curl. iOS switches Remote Automation off after a session that was not ended (ADR-0049).
 */
function trackForExit(session: WebDriverSession): void {
  unended.add(session);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on("exit", () => {
    for (const open of unended) spawnSync("/usr/bin/curl", ["-s", "--max-time", "10", "-X", "DELETE", open.endpoint()], { stdio: "ignore" });
  });
}

function untrackForExit(session: WebDriverSession): void {
  unended.delete(session);
}

/** See `RealSession.cleanupOrigins`. */
async function cleanupOrigins(session: WebDriverSession, origins: readonly string[]): Promise<void> {
  const handles = await session.handles();
  const keep = handles.includes(session.currentHandle()) ? session.currentHandle() : handles[0];
  if (keep === undefined) throw new Error("iPhone cleanup: the session has no tab left");
  for (const handle of handles) {
    if (handle === keep) continue;
    await session.switchTo(handle);
    await session.closeWindow();
  }
  await session.switchTo(keep);
  const noop = (): void => undefined;
  for (const origin of origins) {
    prepareIosOriginForCleanup(origin);
    await session.inWindow(keep, () => session.navigate(`${origin}${CLEANUP_PATH}`));
    const left = (await session.evaluate(keep, serializePageScript(iosCleanupScript, undefined), noop)) as CleanupReport;
    if (left.registrations !== 0 || left.caches !== 0) {
      throw new Error(`iPhone cleanup of ${origin} left ${left.registrations} service worker registration(s) and ${left.caches} cache(s)`);
    }
  }
  await session.inWindow(keep, () => session.navigate("about:blank"));
}
