import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = ts.sys.readFile(decodeURIComponent(new URL("../src/index.ts", import.meta.url).pathname));
if (source === undefined) throw new Error("Cannot read offline-write source");

describe("offline-write package boundary", () => {
  it("depends only on the worker message protocol", () => {
    expect(JSON.parse(ts.sys.readFile(decodeURIComponent(new URL("../package.json", import.meta.url).pathname)) ?? "{}").dependencies).toEqual({
      "@pwa-platform/sw-runtime": "workspace:*",
    });
  });

  it("never owns network, storage, registration, sync or logging", () => {
    for (const pattern of [/\bfetch\s*\(/, /\bindexedDB\b/, /\.register\s*\(/, /\bBackgroundSync\b/, /\bconsole\./]) {
      expect(source, String(pattern)).not.toMatch(pattern);
    }
  });
});
