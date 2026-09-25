import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Scans src/page/ for the HTML-injection and unsafe-navigation APIs spec/pwa-entry-resilience.md's "入口恢复页" and
// docs/adr/0018-entry-resilience-delivery-boundary.md forbid there: text must go through `textContent` only, and
// navigation must go through the injected `navigate` callback (real `location.assign`), never an automatic or
// alternate path. This is a source scan, not a runtime check, so it catches a forbidden API even in a branch no
// test happens to exercise.
const PAGE_DIR = fileURLToPath(new URL("../../src/page/", import.meta.url));

const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "innerHTML", pattern: /\binnerHTML\b/ },
  { name: "outerHTML", pattern: /\bouterHTML\b/ },
  { name: "insertAdjacentHTML", pattern: /\binsertAdjacentHTML\b/ },
  { name: "document.write", pattern: /\bdocument\s*\.\s*write\b/ },
  { name: "window.open", pattern: /\bwindow\s*\.\s*open\b/ },
  { name: "location.replace", pattern: /\blocation\s*\.\s*replace\b/ },
  { name: "location.href", pattern: /\blocation\s*\.\s*href\b/ },
  // Independent review finding (2026-09-17): the recovery page must never navigate on its own; a delayed or
  // deferred callback is exactly the shape an automatic navigation would take, so every scheduling API is
  // forbidden here too, not only the direct navigation APIs above.
  { name: "setTimeout", pattern: /\bsetTimeout\b/ },
  { name: "setInterval", pattern: /\bsetInterval\b/ },
  { name: "requestAnimationFrame", pattern: /\brequestAnimationFrame\b/ },
  { name: "queueMicrotask", pattern: /\bqueueMicrotask\b/ },
  { name: "requestIdleCallback", pattern: /\brequestIdleCallback\b/ },
];

function pageSourceFiles(): readonly string[] {
  return readdirSync(PAGE_DIR).filter((file) => file.endsWith(".ts"));
}

function readPageFile(file: string): string {
  return readFileSync(join(PAGE_DIR, file), "utf-8");
}

describe("src/page/ source scan", () => {
  it("has source files to scan", () => {
    expect(pageSourceFiles().length).toBeGreaterThan(0);
  });

  it("contains none of the forbidden HTML-injection or unsafe-navigation APIs", () => {
    const offenders: string[] = [];
    for (const file of pageSourceFiles()) {
      const text = readPageFile(file);
      for (const { name, pattern } of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detects each forbidden API it claims to, so the check above means something", () => {
    const probes: Readonly<Record<string, string>> = {
      innerHTML: "root.innerHTML = value;",
      outerHTML: "root.outerHTML = value;",
      insertAdjacentHTML: "root.insertAdjacentHTML('beforeend', value);",
      "document.write": "document.write(value);",
      "window.open": "window.open(href);",
      "location.replace": "location.replace(href);",
      "location.href (assignment)": "location.href = href;",
      "location.href (read)": "const current = location.href;",
      setTimeout: "setTimeout(() => navigate(href), 1500);",
      setInterval: "setInterval(() => navigate(href), 1500);",
      requestAnimationFrame: "requestAnimationFrame(() => navigate(href));",
      queueMicrotask: "queueMicrotask(() => navigate(href));",
      requestIdleCallback: "requestIdleCallback(() => navigate(href));",
    };
    for (const [label, snippet] of Object.entries(probes)) {
      const hit = FORBIDDEN.some(({ pattern }) => pattern.test(snippet));
      expect(hit, `expected the forbidden-API patterns to catch: ${label}`).toBe(true);
    }
  });
});
