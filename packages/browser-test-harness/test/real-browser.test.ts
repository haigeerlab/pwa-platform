import { describe, expect, it } from "vitest";
import { RealBrowser, unsupportedMessage } from "../src/real-browser.js";
import {
  describeBrowser,
  playwrightEngineName,
  readRealBrowserKind,
  requestedCapabilities,
  serializePageScript,
  unwrapEvaluation,
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
