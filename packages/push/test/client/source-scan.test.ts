// Source scan of src/client: spec/push-module.md "设计 / 3" and "边界" forbid UA sniffing, any network request, any
// storage, any logging, and registering a worker. This is a text scan, not a runtime check, so it catches a
// forbidden API even in a branch no test happens to exercise. Reads files through TypeScript's host, like
// test/package-boundaries.test.ts, so this package needs no @types/node dependency.
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CLIENT_DIR = decodeURIComponent(new URL("../../src/client/", import.meta.url).pathname);

function read(location: string): string {
  const text = ts.sys.readFile(location);
  if (text === undefined) throw new Error(`Cannot read ${location}`);
  return text;
}

const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "navigator.userAgent", pattern: /\buserAgent\b/ },
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "sendBeacon", pattern: /\bsendBeacon\b/ },
  { name: "localStorage", pattern: /\blocalStorage\b/ },
  { name: "sessionStorage", pattern: /\bsessionStorage\b/ },
  { name: "indexedDB", pattern: /\bindexedDB\b/ },
  { name: "console.", pattern: /\bconsole\s*\./ },
  { name: ".register(", pattern: /\.register\s*\(/ },
];

function clientSourceFiles(): readonly string[] {
  return ts.sys.readDirectory(CLIENT_DIR, [".ts"]).map((file) => file.slice(CLIENT_DIR.length));
}

describe("src/client/ source scan", () => {
  it("has source files to scan", () => {
    expect(clientSourceFiles().length).toBeGreaterThan(0);
  });

  it("contains none of the forbidden APIs", () => {
    const offenders: string[] = [];
    for (const file of clientSourceFiles()) {
      const text = read(`${CLIENT_DIR}${file}`);
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detects each forbidden API it claims to, so the check above means something", () => {
    const probes: Readonly<Record<string, string>> = {
      "navigator.userAgent": "if (navigator.userAgent.includes('x')) {}",
      "fetch(": "await fetch('/x');",
      XMLHttpRequest: "new XMLHttpRequest();",
      sendBeacon: "navigator.sendBeacon(url, data);",
      localStorage: "localStorage.setItem('x', '1');",
      sessionStorage: "sessionStorage.setItem('x', '1');",
      indexedDB: "indexedDB.open('x');",
      "console.": "console.log('x');",
      ".register(": "navigator.serviceWorker.register('/sw.js');",
    };
    for (const [label, snippet] of Object.entries(probes)) {
      const hit = FORBIDDEN.some(({ pattern }) => pattern.test(snippet));
      expect(hit, `expected the forbidden-API patterns to catch: ${label}`).toBe(true);
    }
  });
});
