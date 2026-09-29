import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

/** Environment variable that swaps Playwright's browser fixtures for a real system browser (ADR-0047). */
export const REAL_BROWSER_ENV = "PWA_REAL_BROWSER";
/** Set to `1` to run Firefox with a visible window; Safari cannot run headless. */
export const REAL_BROWSER_HEADED_ENV = "PWA_REAL_BROWSER_HEADED";

export type RealBrowserKind = "safari" | "firefox";

/** Reads `PWA_REAL_BROWSER`; `undefined` when unset, an error for any value other than `safari` or `firefox`. */
export function readRealBrowserKind(env: Readonly<Record<string, string | undefined>>): RealBrowserKind | undefined {
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
  if (kind === "safari") return { browserName: "safari" };
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

/**
 * Body of the Execute Async Script command. It evaluates the source in the page, awaits the result and reports
 * `{ok, value, href}` or `{ok: false, message, href}` (href: the page URL afterwards) through the callback, so a thrown error keeps its message.
 */
export const EVALUATE_SCRIPT = `
const script = arguments[0];
const done = arguments[arguments.length - 1];
Promise.resolve()
  .then(() => {
    const value = (0, eval)("(" + script.source + ")");
    return script.isFunction ? value(script.arg) : value;
  })
  .then(
    (value) => done(value === undefined ? { ok: true, undefined: true, href: location.href } : { ok: true, value, href: location.href }),
    (error) => done({ ok: false, href: location.href, message: error && error.message ? String(error.message) : String(error) }),
  );
`;

type EvaluateOutcome =
  | { readonly ok: true; readonly value?: unknown; readonly undefined?: true; readonly href: string }
  | { readonly ok: false; readonly message: string; readonly href: string };

/** Unwraps what `EVALUATE_SCRIPT` reported, throwing the page-side error. */
export function unwrapEvaluation(outcome: EvaluateOutcome): unknown {
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome.undefined === true ? undefined : outcome.value;
}

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
      : (["geckodriver", ["--port", String(port)]] as const);
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
    const created = (await send(baseUrl, "POST", "/session", { capabilities: { alwaysMatch: capabilities } })) as {
      sessionId: string;
      capabilities: Record<string, unknown>;
    };
    const session = new WebDriverSession(baseUrl, created.sessionId, created.capabilities, "");
    await session.command("POST", "/timeouts", { script: SCRIPT_TIMEOUT, pageLoad: PAGE_LOAD_TIMEOUT });
    session.current = (await session.command("GET", "/window")) as string;
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

  async reload(): Promise<void> {
    await this.command("POST", "/refresh", {});
  }

  /**
   * Runs a function or expression in the current window and returns its (JSON) result; page-side errors throw.
   * `onHref` receives the page URL as the script left it, which keeps a synchronous `page.url()` current.
   */
  async evaluate(script: PageScript, onHref: (href: string) => void): Promise<unknown> {
    const outcome = (await this.command("POST", "/execute/async", {
      script: EVALUATE_SCRIPT,
      args: [script],
    })) as EvaluateOutcome;
    onHref(outcome.href);
    return unwrapEvaluation(outcome);
  }

  async quit(): Promise<void> {
    await this.command("DELETE", "");
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
