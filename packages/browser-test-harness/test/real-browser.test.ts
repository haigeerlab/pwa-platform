import { createServer } from "node:http";
import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { NavigationStatusUnavailableError, RealApiRequestContext, RealBrowser, RealResponse, unsupportedMessage } from "../src/real-browser.js";
import {
  correctedWindowSize,
  describeBrowser,
  firefoxColorSchemeScript,
  keyActions,
  isBrowserErrorPage,
  evaluateScriptFor,
  playwrightEngineName,
  readRealBrowserKind,
  reloadFinished,
  requestedCapabilities,
  serializePageScript,
  startReload,
  unwrapEvaluation,
  WebDriverSession,
} from "../src/webdriver.js";

describe("readRealBrowserKind", () => {
  it("is undefined when unset or empty, so the Chrome path is untouched", () => {
    expect(readRealBrowserKind({})).toBeUndefined();
    expect(readRealBrowserKind({ PWA_REAL_BROWSER: "" })).toBeUndefined();
  });

  it("accepts safari and firefox and rejects anything else", () => {
    expect(readRealBrowserKind({ PWA_REAL_BROWSER: "safari" })).toBe("safari");
    expect(readRealBrowserKind({ PWA_REAL_BROWSER: "firefox" })).toBe("firefox");
    expect(() => readRealBrowserKind({ PWA_REAL_BROWSER: "chrome" })).toThrow(/"safari" or "firefox"/);
  });
});

describe("browser identity", () => {
  it("maps capabilities to the real version and a label", () => {
    expect(describeBrowser("safari", { browserName: "Safari", browserVersion: "18.6" })).toEqual({
      version: "18.6",
      label: "Safari 18.6 (safaridriver)",
    });
    expect(describeBrowser("firefox", { browserVersion: "157.0" }).label).toBe("Firefox 157.0 (geckodriver)");
    expect(describeBrowser("firefox", {}).version).toBe("unknown");
  });

  it("reports the Playwright engine name that browserName based skips understand", () => {
    expect(playwrightEngineName("safari")).toBe("webkit");
    expect(playwrightEngineName("firefox")).toBe("firefox");
  });

  it("runs Firefox headless unless PWA_REAL_BROWSER_HEADED=1, and Safari with no options", () => {
    expect(requestedCapabilities("safari", {})).toEqual({ browserName: "safari" });
    expect(requestedCapabilities("firefox", {})).toEqual({
      browserName: "firefox",
      "moz:firefoxOptions": { args: ["-headless"] },
    });
    expect(requestedCapabilities("firefox", { PWA_REAL_BROWSER_HEADED: "1" })).toEqual({
      browserName: "firefox",
      "moz:firefoxOptions": { args: [] },
    });
  });
});

describe("page scripts", () => {
  it("serializes a function with its argument and an expression without one", () => {
    const script = serializePageScript((arg: { n: number }) => arg.n + 1, { n: 1 });
    expect(script.isFunction).toBe(true);
    expect(script.arg).toEqual({ n: 1 });
    expect((0, eval)(`(${script.source})`)(script.arg)).toBe(2);
    expect(serializePageScript("1 + 1", undefined)).toEqual({ source: "1 + 1", isFunction: false, arg: null });
  });

  it("sends undefined arguments as null", () => {
    expect(serializePageScript(() => 1, undefined).arg).toBeNull();
  });

  it("unwraps results, undefined and page-side errors", () => {
    expect(unwrapEvaluation({ ok: true, value: [1], href: "about:blank" })).toEqual([1]);
    expect(unwrapEvaluation({ ok: true, undefined: true, href: "about:blank" })).toBeUndefined();
    expect(() => unwrapEvaluation({ ok: false, message: "boom", href: "about:blank" })).toThrow("boom");
  });
});

describe("EVALUATE_SCRIPT", () => {
  type Reply = { ok?: boolean; value?: unknown; pending?: number; message?: string; href: string };

  /** Runs the script body the way a driver does: `arguments` are the request and the completion callback. */
  function call(request: { source: string; isFunction: boolean; arg: unknown; poll: number | null; waitMs: number }): Promise<Reply> {
    Reflect.set(globalThis, "location", { href: "http://page/" });
    const body = new Function(evaluateScriptFor(request.source)) as (...args: unknown[]) => void;
    return new Promise((resolve) => body(request, resolve));
  }

  it("answers a quick script in one call", async () => {
    const script = serializePageScript((n: number) => n * 2, 21);
    expect(await call({ ...script, poll: null, waitMs: 50 })).toEqual({ ok: true, value: 42, href: "http://page/" });
  });

  it("reports a slow script as pending, lets other scripts run meanwhile, and hands the result over on a later call", async () => {
    const slow = serializePageScript("new Promise((resolve) => setTimeout(() => resolve('late'), 120))", undefined);
    const first = await call({ ...slow, poll: null, waitMs: 10 });
    expect(first).toMatchObject({ pending: expect.any(Number) });
    const quick = serializePageScript("1 + 1", undefined);
    expect(await call({ ...quick, poll: null, waitMs: 50 })).toMatchObject({ ok: true, value: 2 });
    const id = (first as { pending: number }).pending;
    expect(await call({ ...slow, poll: id, waitMs: 500 })).toEqual({ ok: true, value: "late", href: "http://page/" });
    expect(await call({ ...slow, poll: id, waitMs: 10 })).toMatchObject({ ok: false, message: "Execution context was destroyed" });
  });

  it("never calls eval, which a page with a strict CSP refuses", async () => {
    Reflect.set(globalThis, "location", { href: "http://page/" });
    const script = serializePageScript((n: number) => n + 1, 1);
    // The parameter shadows the global `eval` for the script body, as a CSP without 'unsafe-eval' would.
    const body = new Function("eval", "args", `return (function () { ${evaluateScriptFor(script.source)} }).apply(null, args);`) as (
      ...args: unknown[]
    ) => void;
    const refuse = (): never => {
      throw new EvalError("Refused to evaluate a string as JavaScript");
    };
    const reply = await new Promise<Reply>((resolve) => body(refuse, [{ ...script, poll: null, waitMs: 50 }, resolve]));
    expect(reply).toEqual({ ok: true, value: 2, href: "http://page/" });
  });

  it("hands the function an argument rebuilt by the page's own JSON, so plain-object checks in page code hold in Firefox", async () => {
    // Firefox builds the driver's `arguments` in its own realm; the page's `JSON.parse` yields objects of the page's realm.
    const pageRealm = Object.create(globalThis) as Record<string, unknown>;
    pageRealm["JSON"] = { parse: (text: string) => ({ ...(JSON.parse(text) as object), builtBy: "page" }) };
    Reflect.set(globalThis, "window", pageRealm);
    try {
      const script = serializePageScript((arg: { readonly n: number }) => arg, { n: 1 });
      expect(await call({ ...script, poll: null, waitMs: 50 })).toEqual({ ok: true, value: { n: 1, builtBy: "page" }, href: "http://page/" });
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("keeps a thrown error's message", async () => {
    const failing = serializePageScript(() => Promise.reject(new Error("boom")), undefined);
    expect(await call({ ...failing, poll: null, waitMs: 50 })).toMatchObject({ ok: false, message: "boom" });
  });
});

describe("session command ordering", () => {
  it("never lets one page switch the window under another page's step", async () => {
    const log: string[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        const path = `${request.method} ${request.url}`;
        let value: unknown = null;
        if (path === "POST /session") value = { sessionId: "s", capabilities: {} };
        else if (path === "GET /session/s/window") value = "a";
        else if (path === "POST /session/s/window") log.push(`switch ${(JSON.parse(body) as { handle: string }).handle}`);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ value }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      const session = await WebDriverSession.create(`http://127.0.0.1:${port}`, {});
      const step = (name: string) => async (): Promise<void> => {
        log.push(`${name} start`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        log.push(`${name} end`);
      };
      await Promise.all([session.inWindow("b", step("b1")), session.inWindow("c", step("c1")), session.inWindow("b", step("b2"))]);
      expect(log).toEqual(["switch b", "b1 start", "b1 end", "switch c", "c1 start", "c1 end", "switch b", "b2 start", "b2 end"]);
      await expect(session.inWindow("b", async () => Promise.reject(new Error("step failed")))).rejects.toThrow("step failed");
      await expect(session.inWindow("b", async () => "still runs")).resolves.toBe("still runs");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("page.request", () => {
  it("requests from Node with the given headers and exposes status, lower-cased headers, bytes, text and json", async () => {
    const seen: string[] = [];
    const server = createServer((request, response) => {
      seen.push(String(request.headers["cache-control"]));
      response.writeHead(200, { "Content-Type": "application/json", "X-Probe": "1" });
      response.end('{"a":1}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      const response = await new RealApiRequestContext().get(`http://127.0.0.1:${port}/`, { headers: { "cache-control": "no-cache" } });
      expect(seen).toEqual(["no-cache"]);
      expect([response.status(), response.ok()]).toEqual([200, true]);
      expect(response.headers()).toMatchObject({ "content-type": "application/json", "x-probe": "1" });
      expect((await response.body()).toString()).toBe('{"a":1}');
      expect(await response.text()).toBe('{"a":1}');
      expect(await response.json()).toEqual({ a: 1 });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("browser error page", () => {
  it("recognises the page Safari's driver lands on after a failed navigation", () => {
    expect(isBrowserErrorPage("safari-resource:/ErrorPage.html")).toBe(true);
    expect(isBrowserErrorPage("data:text/html,")).toBe(true);
    expect(isBrowserErrorPage("http://localhost:1/app/")).toBe(false);
  });
});

describe("navigation response", () => {
  const evidence = { status: 200, protocol: "http/1.1", url: "http://x/" };

  it("reports status and url, and refuses a status the browser did not report", () => {
    const response = new RealResponse("firefox", evidence);
    expect([response.status(), response.ok(), response.url()]).toEqual([200, true, "http://x/"]);
    expect(() => new RealResponse("firefox", { ...evidence, status: 0 }).status()).toThrow(NavigationStatusUnavailableError);
  });

  it("tells a response that did not come over the network by its empty protocol, never by workerStart", () => {
    expect(new RealResponse("safari", evidence).fromServiceWorker()).toBe(false);
    expect(new RealResponse("safari", { ...evidence, protocol: "" }).fromServiceWorker()).toBe(true);
    expect(new RealResponse("firefox", { ...evidence, protocol: "" }).fromServiceWorker()).toBe(true);
  });

  it("does not pretend to have headers", () => {
    expect(() => new RealResponse("safari", evidence).toPlaywright().headers()).toThrow(unsupportedMessage("safari", "response.headers"));
  });
});

describe("unsupported Playwright capabilities", () => {
  const browser = new RealBrowser("safari", { baseUrl: "http://127.0.0.1:0", stop: async () => undefined }, { version: "18.6", label: "Safari 18.6 (safaridriver)" }, {});

  it("reports the real version and engine name", () => {
    expect(browser.version()).toBe("18.6");
    expect(browser.browserType().name()).toBe("webkit");
  });

  it("throws a named error instead of silently doing nothing", () => {
    const stand = browser.toPlaywright();
    expect(() => stand.newContext()).toThrow(unsupportedMessage("safari", "browser.newContext"));
    expect(() => stand.newContext()).toThrow(/^Not supported on real browser \(PWA_REAL_BROWSER=safari\): /);
  });

  it("names the whole path of a chained call", () => {
    const stand = browser.toPlaywright() as unknown as { a: { b: () => void } };
    expect(() => stand.a.b()).toThrow("browser.a.b");
  });
});

describe("reload", () => {
  it("reloads from inside the page, never through the driver's Refresh command", async () => {
    const commands: string[] = [];
    let probes = 0;
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        const path = `${request.method} ${request.url}`;
        commands.push(path);
        const reply = (value: unknown, status = 200): void => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify({ value }));
        };
        if (path === "POST /session") return reply({ sessionId: "s", capabilities: { browserVersion: "1" } });
        if (path === "GET /session/s/window") return reply("handle");
        if (path !== "POST /session/s/execute/async") return reply(null);
        // Execute Async Script: args[0] is the serialized page script, whose result goes back as `{ok, value, href}`.
        const script = (JSON.parse(body) as { args: { source: string; arg: unknown }[] }).args[0];
        if (script?.source === startReload.toString()) return reply({ ok: true, value: 1234.5, href: "http://x/" });
        if (script?.source !== reloadFinished.toString()) return reply(null, 500);
        expect(script.arg).toBe(1234.5);
        probes += 1;
        if (probes === 2) return reply({ error: "javascript error", message: "Document was unloaded" }, 500);
        return reply({ ok: true, value: probes >= 3, href: "http://x/" });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      const session = await WebDriverSession.create(`http://127.0.0.1:${port}`, {});
      await session.reload("handle");
      expect(commands).not.toContain("POST /session/s/refresh");
      expect(probes).toBe(3);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("keyActions", () => {
  const sequence = (key: string): unknown[] =>
    ((keyActions(key).actions[0] as { actions: { type: string; value: string }[] }).actions).map((action) => `${action.type} ${JSON.stringify(action.value)}`);

  it("presses and releases a named key or a single character", () => {
    expect(sequence("Tab")).toEqual(['keyDown "\ue004"', 'keyUp "\ue004"']);
    expect(sequence("Enter")).toEqual(['keyDown "\ue007"', 'keyUp "\ue007"']);
    expect(sequence("Space")).toEqual(['keyDown " "', 'keyUp " "']);
    expect(sequence("a")).toEqual(['keyDown "a"', 'keyUp "a"']);
  });

  it("holds modifiers around the key and releases them in reverse order", () => {
    expect(sequence("Shift+Tab")).toEqual(['keyDown "\ue008"', 'keyDown "\ue004"', 'keyUp "\ue004"', 'keyUp "\ue008"']);
    expect(sequence("Control+Shift+a")).toEqual([
      'keyDown "\ue009"',
      'keyDown "\ue008"',
      'keyDown "a"',
      'keyUp "a"',
      'keyUp "\ue008"',
      'keyUp "\ue009"',
    ]);
  });

  it("rejects keys it does not know instead of typing their letters", () => {
    expect(() => keyActions("F13")).toThrow('Unsupported key "F13"');
    expect(() => keyActions("Tab+Enter")).toThrow("Only modifiers may precede");
  });
});

describe("window size and colour scheme helpers", () => {
  it("adds the difference between the wanted and the measured viewport to the outer size", () => {
    expect(correctedWindowSize({ width: 320, height: 650 }, { width: 320, height: 650 }, { width: 320, height: 577 })).toEqual({ width: 320, height: 723 });
    expect(correctedWindowSize({ width: 320, height: 650 }, { width: 500, height: 650 }, { width: 500, height: 577 })).toEqual({ width: 320, height: 723 });
    expect(correctedWindowSize({ width: 1, height: 1 }, { width: 10, height: 10 }, { width: 900, height: 900 })).toEqual({ width: 1, height: 1 });
  });

  it("sets Firefox's content colour-scheme override to 0 for dark and 1 for light", () => {
    expect(firefoxColorSchemeScript("dark")).toContain('"layout.css.prefers-color-scheme.content-override", 0');
    expect(firefoxColorSchemeScript("light")).toContain('"layout.css.prefers-color-scheme.content-override", 1');
  });
});

describe("page.setViewportSize, page.emulateMedia and page.keyboard on a driver", () => {
  type Sent = { readonly path: string; readonly body: unknown };

  /** A driver whose window has a fixed border and a minimum outer width; `matchMedia` reports `dark`. */
  async function withDriver(
    kind: "safari" | "firefox",
    minOuterWidth: number,
    run: (page: Page, sent: Sent[]) => Promise<void>,
  ): Promise<void> {
    const sent: Sent[] = [];
    let outer = { width: 1000, height: 800 };
    let dark = false;
    const server = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk: Buffer) => (text += chunk.toString()));
      request.on("end", () => {
        const body = text === "" ? undefined : (JSON.parse(text) as unknown);
        const path = `${request.method} ${request.url}`;
        sent.push({ path, body });
        let value: unknown = null;
        if (path === "POST /session") value = { sessionId: "s", capabilities: { browserVersion: "1" } };
        else if (path === "GET /session/s/window") value = "handle";
        else if (path === "GET /session/s/window/rect") value = outer;
        else if (path === "POST /session/s/window/rect") {
          const wanted = body as { width: number; height: number };
          outer = { width: Math.max(minOuterWidth, wanted.width), height: wanted.height };
          value = outer;
        } else if (path === "POST /session/s/execute/sync") dark = true;
        else if (path === "POST /session/s/execute/async") {
          const source = (body as { args: { source: string }[] }).args[0]?.source ?? "";
          const inner = { width: outer.width, height: outer.height - 73 };
          value = { ok: true, value: source.includes("matchMedia") ? (dark ? "dark" : "light") : inner, href: "about:blank" };
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ value }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      const browser = new RealBrowser(kind, { baseUrl: `http://127.0.0.1:${port}`, stop: async () => undefined }, { version: "1", label: "x" }, {});
      const session = await browser.openSession();
      await run(session.page, sent);
      await session.quit();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it("corrects the outer window for the browser's chrome and reports the measured viewport", async () => {
    await withDriver("firefox", 0, async (page, sent) => {
      await page.setViewportSize({ width: 320, height: 650 });
      expect(page.viewportSize()).toEqual({ width: 320, height: 650 });
      expect(sent.filter((entry) => entry.path === "POST /session/s/window/rect").map((entry) => entry.body)).toEqual([{ width: 320, height: 723 }]);
    });
  });

  it("reports the achieved width, not the requested one, when the window has a minimum size", async () => {
    await withDriver("firefox", 500, async (page) => {
      await page.setViewportSize({ width: 320, height: 650 });
      expect(page.viewportSize()).toEqual({ width: 500, height: 650 });
    });
  });

  it("forces the colour scheme in Firefox's chrome context and returns to content", async () => {
    await withDriver("firefox", 0, async (page, sent) => {
      await page.emulateMedia({ colorScheme: "dark" });
      const contexts = sent.filter((entry) => entry.path === "POST /session/s/moz/context").map((entry) => (entry.body as { context: string }).context);
      expect(contexts).toEqual(["chrome", "content"]);
    });
  });

  it("does nothing in Safari when the system appearance already is the requested scheme", async () => {
    await withDriver("safari", 0, async (page, sent) => {
      await page.emulateMedia({ colorScheme: "light" });
      expect(sent.some((entry) => entry.path.includes("moz/context"))).toBe(false);
    });
  });

  it("refuses every other emulateMedia option and the reset", async () => {
    await withDriver("firefox", 0, async (page) => {
      await expect(page.emulateMedia({ media: "print" })).rejects.toThrow(/Not supported on real browser \(PWA_REAL_BROWSER=firefox\): page\.emulateMedia/);
      await expect(page.emulateMedia({ colorScheme: null })).rejects.toThrow(/Not supported on real browser/);
      await expect(page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })).rejects.toThrow(/Not supported on real browser/);
    });
  });

  it("sends key presses as W3C actions and refuses other keyboard members", async () => {
    await withDriver("safari", 0, async (page, sent) => {
      await page.keyboard.press("Tab");
      expect(sent.map((entry) => entry.path).filter((path) => path.includes("/actions"))).toEqual(["POST /session/s/actions", "DELETE /session/s/actions"]);
      expect(() => page.keyboard.type("x")).toThrow("page.keyboard.type");
    });
  });
});
