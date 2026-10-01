import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { iosCapabilities, readIosDevice } from "./ios.js";

/** Environment variable that swaps Playwright's browser fixtures for a real system browser (ADR-0047). */
export const REAL_BROWSER_ENV = "PWA_REAL_BROWSER";
/** Set to `1` to run Firefox with a visible window; Safari cannot run headless. */
export const REAL_BROWSER_HEADED_ENV = "PWA_REAL_BROWSER_HEADED";

export type RealBrowserKind = "safari" | "firefox";

/**
 * Reads `PWA_REAL_BROWSER`; `undefined` when unset, an error for any value other than `safari` or `firefox`. An iPhone
 * run (`PWA_IOS_*`, ADR-0049) is a real Safari too: it reports `safari`, so every Safari based skip applies.
 */
export function readRealBrowserKind(env: Readonly<Record<string, string | undefined>>): RealBrowserKind | undefined {
  if (readIosDevice(env) !== undefined) return "safari";
  const value = env[REAL_BROWSER_ENV];
  if (value === undefined || value === "") return undefined;
  if (value === "safari" || value === "firefox") return value;
  throw new Error(`${REAL_BROWSER_ENV} must be "safari" or "firefox", got "${value}"`);
}

/** Playwright engine name that existing `browserName` based skips understand. */
export function playwrightEngineName(kind: RealBrowserKind): "webkit" | "firefox" {
  return kind === "safari" ? "webkit" : "firefox";
}

/** W3C `capabilities` request for a new session of the given browser. */
export function requestedCapabilities(
  kind: RealBrowserKind,
  env: Readonly<Record<string, string | undefined>>,
): Record<string, unknown> {
  if (kind === "safari") {
    const ios = readIosDevice(env);
    return ios === undefined ? { browserName: "safari" } : iosCapabilities(ios);
  }
  const headed = env[REAL_BROWSER_HEADED_ENV] === "1";
  return { browserName: "firefox", "moz:firefoxOptions": { args: headed ? [] : ["-headless"] } };
}

/** The version and human-readable label of the browser a session reported. */
export type BrowserIdentity = { readonly version: string; readonly label: string };

/** Maps the session's returned capabilities to a version and a label such as "Safari 18.6 (safaridriver)". */
export function describeBrowser(kind: RealBrowserKind, capabilities: Readonly<Record<string, unknown>>): BrowserIdentity {
  const version = typeof capabilities["browserVersion"] === "string" ? capabilities["browserVersion"] : "unknown";
  return kind === "safari"
    ? { version, label: `Safari ${version} (safaridriver)` }
    : { version, label: `Firefox ${version} (geckodriver)` };
}

/** Script run in Firefox's chrome context to force the colour scheme content sees (0 dark, 1 light). */
export function firefoxColorSchemeScript(colorScheme: "light" | "dark"): string {
  return `Services.prefs.setIntPref("layout.css.prefers-color-scheme.content-override", ${colorScheme === "dark" ? 0 : 1}); return true;`;
}

/** The outer window size that should give an inner (viewport) size of `target`, given the last outer and inner sizes. */
export function correctedWindowSize(
  target: { readonly width: number; readonly height: number },
  outer: { readonly width: number; readonly height: number },
  inner: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, outer.width + (target.width - inner.width)),
    height: Math.max(1, outer.height + (target.height - inner.height)),
  };
}

const KEY_CODES: Readonly<Record<string, string>> = {
  Backspace: "\uE003",
  Tab: "\uE004",
  Enter: "\uE007",
  Shift: "\uE008",
  Control: "\uE009",
  Alt: "\uE00A",
  Escape: "\uE00C",
  Space: " ",
  End: "\uE010",
  Home: "\uE011",
  ArrowLeft: "\uE012",
  ArrowUp: "\uE013",
  ArrowRight: "\uE014",
  ArrowDown: "\uE015",
  Delete: "\uE017",
  Meta: "\uE03D",
};

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

/** W3C Perform Actions payload for a Playwright style key press such as `Tab`, `Shift+Tab`, `Enter` or `Space`. */
export function keyActions(key: string): { readonly actions: readonly unknown[] } {
  const parts = key === "+" ? [key] : key.split("+");
  const codes = parts.map((part) => {
    const code = KEY_CODES[part] ?? (part.length === 1 ? part : undefined);
    if (code === undefined) throw new Error(`Unsupported key "${part}" in "${key}"`);
    return code;
  });
  if (!parts.slice(0, -1).every((part) => MODIFIERS.has(part))) throw new Error(`Only modifiers may precede the key in "${key}"`);
  const modifiers = codes.slice(0, -1);
  const last = codes[codes.length - 1] as string;
  const actions = [
    ...modifiers.map((value) => ({ type: "keyDown", value })),
    { type: "keyDown", value: last },
    { type: "keyUp", value: last },
    ...[...modifiers].reverse().map((value) => ({ type: "keyUp", value })),
  ];
  return { actions: [{ type: "key", id: "keyboard", actions }] };
}

/** Safari WebDriver does not fail a navigation that cannot load: it lands on this built-in error page instead. */
export function isBrowserErrorPage(url: string): boolean {
  return url.startsWith("safari-resource:");
}

/** Failure reported by the driver or by a script run in the page. */
export class WebDriverError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "WebDriverError";
  }
}

/** A function or expression to run in the page, and the JSON argument passed to it. */
export type PageScript = { readonly source: string; readonly isFunction: boolean; readonly arg: unknown };

/** Serializes what Playwright's `page.evaluate` accepts: a function (called with `arg`) or an expression string. */
export function serializePageScript(target: string | ((arg: never) => unknown), arg: unknown): PageScript {
  return typeof target === "string"
    ? { source: target, isFunction: false, arg: null }
    : { source: target.toString(), isFunction: true, arg: arg === undefined ? null : arg };
}

/** How long one Execute Async Script command waits for a page script before handing the session back to the caller. */
export const EVALUATE_SLICE_MS = 100;

/**
 * Body of the Execute Async Script command. The first call (`request.poll === null`) starts the script in the page;
 * every call then waits up to `request.waitMs` for it and reports `{ok, value, href}`, `{ok: false, message, href}` or
 * `{pending: id, href}` (href: the page URL afterwards) through the callback, so a thrown error keeps its message.
 * A pending script is collected by a later call with `poll: id`. WebDriver runs one command at a time per session, so
 * a script that waits on something the test does next (a request held open, a second page.evaluate) would otherwise
 * deadlock the session; Playwright's evaluate calls overlap freely and the specs rely on it.
 */
export const EVALUATE_SCRIPT = `
const request = arguments[0];
const done = arguments[arguments.length - 1];
// Firefox gives every driver script a fresh \`globalThis\`; expandos on \`window\` are what survive between calls.
const root = typeof window !== "undefined" ? window : globalThis;
const store = root.__pwaEvaluations || (root.__pwaEvaluations = { next: 1, running: {} });
let id = request.poll;
if (id === null) {
  id = store.next++;
  store.running[id] = Promise.resolve()
    .then(() => {
      const value = __pageSource();
      // Firefox builds \`request.arg\` in the driver's own realm, so page code that tests \`Object.getPrototypeOf(arg) ===
      // Object.prototype\` (a plain-object check) would reject it. A JSON round trip through the page's own \`JSON\` rebuilds it there.
      const arg = request.arg !== null && typeof request.arg === "object" ? root.JSON.parse(JSON.stringify(request.arg)) : request.arg;
      return request.isFunction ? value(arg) : value;
    })
    .then(
      (value) => (value === undefined ? { ok: true, undefined: true } : { ok: true, value }),
      (error) => ({ ok: false, message: error && error.message ? String(error.message) : String(error) }),
    );
}
const running = store.running[id];
if (running === undefined) {
  done({ ok: false, href: location.href, message: "Execution context was destroyed" });
} else {
  let timer;
  Promise.race([running, new Promise((resolve) => { timer = setTimeout(() => resolve(null), request.waitMs); })]).then((outcome) => {
    clearTimeout(timer);
    if (outcome === null) return done({ pending: id, href: location.href });
    delete store.running[id];
    done({ ...outcome, href: location.href });
  });
}
`;

/**
 * The complete Execute Async Script body for a page script: `source` is compiled together with `EVALUATE_SCRIPT` by the
 * driver instead of being handed to `eval` in the page, which a page whose CSP forbids `unsafe-eval` would refuse
 * (the offline page's strict policy does). The newline keeps a trailing `//` comment of `source` from eating the bracket.
 */
export function evaluateScriptFor(source: string): string {
  return `const __pageSource = () => (${source}\n);\n${EVALUATE_SCRIPT}`;
}

type EvaluateOutcome =
  | { readonly ok: true; readonly value?: unknown; readonly undefined?: true; readonly href: string }
  | { readonly ok: false; readonly message: string; readonly href: string };

type EvaluateReply = EvaluateOutcome | { readonly pending: number; readonly href: string };

/** Unwraps what `EVALUATE_SCRIPT` reported, throwing the page-side error. */
export function unwrapEvaluation(outcome: EvaluateOutcome): unknown {
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.undefined === true ? undefined : outcome.value;
}

/**
 * Starts a reload from inside the page and returns the current document's `performance.timeOrigin`, which differs
 * for every document. The WebDriver Refresh command cannot be used: Firefox performs it as a force-reload that
 * bypasses the service worker, so the reloaded page is uncontrolled, unlike Playwright's and a user's plain reload.
 */
export function startReload(): number {
  setTimeout(() => location.reload(), 0);
  return performance.timeOrigin;
}

/** True once a document other than the one whose `timeOrigin` is `origin` has finished loading. */
export function reloadFinished(origin: number): boolean {
  return performance.timeOrigin !== origin && document.readyState === "complete";
}

const RELOAD_TIMEOUT = 30_000;
const RELOAD_POLL = 50;

const READY_TIMEOUT = 15_000;

/** A running driver process (safaridriver or geckodriver) listening on a free local port. */
export type DriverProcess = { readonly baseUrl: string; stop(): Promise<void> };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Starts the browser's driver on a free port and waits until its `/status` reports ready. */
export async function startDriver(kind: RealBrowserKind): Promise<DriverProcess> {
  const port = await freePort();
  const [command, args] =
    kind === "safari"
      ? (["/usr/bin/safaridriver", ["-p", String(port)]] as const)
      : (["geckodriver", ["--port", String(port), "--allow-system-access"]] as const);
  const child: ChildProcess = spawn(command, args, { stdio: "ignore" });
  const spawnError = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(new Error(`Cannot start ${command}: ${error.message}`)));
    child.once("exit", (code) => reject(new Error(`${command} exited early with code ${code}`)));
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    await exited;
  };
  spawnError.catch(() => undefined);
  const deadline = Date.now() + READY_TIMEOUT;
  for (;;) {
    try {
      const response = await Promise.race([fetch(`${baseUrl}/status`), spawnError]);
      if (response.ok) return { baseUrl, stop };
    } catch (error) {
      if (error instanceof Error && /Cannot start|exited early/.test(error.message)) throw error;
    }
    if (Date.now() >= deadline) {
      await stop();
      throw new Error(`${command} did not become ready within ${READY_TIMEOUT} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const SCRIPT_TIMEOUT = 120_000;
const PAGE_LOAD_TIMEOUT = 30_000;

/** One W3C WebDriver session: the HTTP protocol subset the real-browser adapter needs, over Node's `fetch`. */
export class WebDriverSession {
  /** Capabilities the driver returned for this session (browser name and version among them). */
  readonly capabilities: Readonly<Record<string, unknown>>;
  private current: string;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly baseUrl: string,
    private readonly id: string,
    capabilities: Readonly<Record<string, unknown>>,
    firstHandle: string,
  ) {
    this.capabilities = capabilities;
    this.current = firstHandle;
  }

  static async create(baseUrl: string, capabilities: Record<string, unknown>): Promise<WebDriverSession> {
    const created = (await createSessionRequest(baseUrl, capabilities)) as {
      sessionId: string;
      capabilities: Record<string, unknown>;
    };
    const session = new WebDriverSession(baseUrl, created.sessionId, created.capabilities, "");
    try {
      await session.command("POST", "/timeouts", { script: SCRIPT_TIMEOUT, pageLoad: PAGE_LOAD_TIMEOUT });
      session.current = (await session.command("GET", "/window")) as string;
    } catch (error) {
      // A session left open makes iOS switch Remote Automation off (ADR-0049): end it before reporting the failure.
      await session.quit().catch(() => undefined);
      throw error;
    }
    return session;
  }

  private command(method: string, path: string, body?: unknown): Promise<unknown> {
    return send(this.baseUrl, method, `/session/${this.id}${path}`, body);
  }

  /** Makes `handle` the window that later commands act on; a no-op when it already is. */
  async switchTo(handle: string): Promise<void> {
    if (handle === this.current) return;
    await this.command("POST", "/window", { handle });
    this.current = handle;
  }

  /** The DELETE endpoint that ends this session; used to end it from a process `exit` handler. */
  endpoint(): string {
    return `${this.baseUrl}/session/${this.id}`;
  }

  currentHandle(): string {
    return this.current;
  }

  async handles(): Promise<string[]> {
    return (await this.command("GET", "/window/handles")) as string[];
  }

  /** Opens a new tab in this session and returns its handle without switching to it. */
  async newTab(): Promise<string> {
    const created = (await this.command("POST", "/window/new", { type: "tab" })) as { handle: string };
    return created.handle;
  }

  /** Closes the current window; returns the remaining handles. The caller must switch to one before continuing. */
  async closeWindow(): Promise<string[]> {
    const remaining = (await this.command("DELETE", "/window")) as string[];
    this.current = "";
    return remaining;
  }

  async navigate(url: string): Promise<void> {
    await this.command("POST", "/url", { url });
  }

  async url(): Promise<string> {
    return (await this.command("GET", "/url")) as string;
  }

  /** Reloads with a plain (service worker aware) reload and resolves once the new document has loaded. */
  async reload(handle: string): Promise<void> {
    const ignore = (): void => undefined;
    const origin = (await this.evaluate(handle, serializePageScript(startReload, undefined), ignore)) as number;
    const deadline = Date.now() + RELOAD_TIMEOUT;
    for (;;) {
      try {
        if (await this.evaluate(handle, serializePageScript(reloadFinished, origin), ignore)) return;
      } catch {
        // The document is being replaced; the driver may refuse scripts until the new one exists.
      }
      if (Date.now() >= deadline) throw new Error(`page.reload: Timeout ${RELOAD_TIMEOUT}ms exceeded.`);
      await new Promise((resolve) => setTimeout(resolve, RELOAD_POLL));
    }
  }

  /**
   * Runs `step` (one or more commands) with `handle` as the current window, after every earlier `inWindow` step has
   * finished. Steps of different pages can therefore overlap in the caller without one switching windows under another.
   */
  inWindow<T>(handle: string, step: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      await this.switchTo(handle);
      return step();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Runs a function or expression in window `handle` and returns its (JSON) result; page-side errors throw.
   * The script runs in slices of `EVALUATE_SLICE_MS`, each its own `inWindow` step, so other steps can run while it
   * waits. `onHref` receives the page URL as the script left it, which keeps a synchronous `page.url()` current.
   */
  async evaluate(handle: string, script: PageScript, onHref: (href: string) => void): Promise<unknown> {
    let poll: number | null = null;
    for (;;) {
      const reply = (await this.inWindow(handle, () =>
        this.command("POST", "/execute/async", {
          script: evaluateScriptFor(script.source),
          args: [{ ...script, poll, waitMs: EVALUATE_SLICE_MS }],
        }),
      )) as EvaluateReply;
      onHref(reply.href);
      if (!("pending" in reply)) return unwrapEvaluation(reply);
      poll = reply.pending;
    }
  }

  /** Presses a key (see `keyActions`) in window `handle`. */
  async pressKey(handle: string, key: string): Promise<void> {
    const payload = keyActions(key);
    await this.inWindow(handle, async () => {
      await this.command("POST", "/actions", payload);
      await this.command("DELETE", "/actions");
    });
  }

  /** The outer window size of window `handle`. */
  windowRect(handle: string): Promise<{ readonly width: number; readonly height: number }> {
    return this.inWindow(handle, async () => (await this.command("GET", "/window/rect")) as { width: number; height: number });
  }

  /** Sets the outer window size of window `handle` and returns the size the browser actually gave it. */
  setWindowRect(handle: string, size: { readonly width: number; readonly height: number }): Promise<{ readonly width: number; readonly height: number }> {
    return this.inWindow(handle, async () => (await this.command("POST", "/window/rect", size)) as { width: number; height: number });
  }

  /**
   * Forces the colour scheme Firefox content sees, through geckodriver's chrome context (needs `--allow-system-access`,
   * see `startDriver`). The preference applies to the whole browser instance, which is one session here.
   */
  async setFirefoxColorScheme(handle: string, colorScheme: "light" | "dark"): Promise<void> {
    await this.inWindow(handle, async () => {
      await this.command("POST", "/moz/context", { context: "chrome" });
      try {
        await this.command("POST", "/execute/sync", { script: firefoxColorSchemeScript(colorScheme), args: [] });
      } finally {
        await this.command("POST", "/moz/context", { context: "content" });
      }
    });
  }

  async quit(): Promise<void> {
    await this.command("DELETE", "");
  }
}

/** Pause and attempts for a device that is momentarily busy right after the previous session ended. */
const DEVICE_BUSY_PAUSE_MS = 2_000;
const DEVICE_BUSY_ATTEMPTS = 3;

/**
 * POST /session. An iPhone that has just ended a session may answer "Some devices were found, but could not be used" for
 * a moment (seen once in a back-to-back run, ADR-0049); only that answer is retried, a few times. Any other failure,
 * above all "Remote Automation is turned off", is reported at once: retrying cannot fix it.
 */
async function createSessionRequest(baseUrl: string, capabilities: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send(baseUrl, "POST", "/session", { capabilities: { alwaysMatch: capabilities } });
    } catch (error) {
      const busy = error instanceof Error && error.message.includes("could not be used") && !/Remote Automation|remote control/i.test(error.message);
      if (!busy || attempt >= DEVICE_BUSY_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, DEVICE_BUSY_PAUSE_MS));
    }
  }
}

async function send(baseUrl: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed = (text === "" ? {} : JSON.parse(text)) as { value?: unknown };
  const value = parsed.value;
  if (!response.ok) {
    const error = value as { error?: string; message?: string } | undefined;
    throw new WebDriverError(`${method} ${path}: ${error?.error ?? response.status} ${error?.message ?? ""}`.trim(), error?.error ?? "unknown");
  }
  return value;
}
