// The notice is positioned only with logical inset properties, which browsers below the supported floor lack (Chrome
// and Edge before 87, Safari before 14.1, iOS before 14.5). There a fixed element with no usable offset stays at its
// static position — at the end of the page, outside the viewport — so the notice is never seen. This test keeps the
// `@supports not (inset-inline-start: 0)` block in step with the logical rules: every selector that sets a logical
// inset has a fallback setting the matching physical side to the same value.
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Read through TypeScript's host, as package-boundaries.test.ts does, so the test needs no Node typings. */
const CSS = ts.sys.readFile(decodeURIComponent(new URL("../src/update-notice.css", import.meta.url).pathname)) ?? "";
const SUPPORTS = "@supports not (inset-inline-start: 0) {";
/** Left-to-right mapping; the fallback only has to hold the layout a browser without logical properties can show. */
const PHYSICAL: Readonly<Record<string, string>> = {
  "inset-block-start": "top",
  "inset-block-end": "bottom",
  "inset-inline-start": "left",
  "inset-inline-end": "right",
};

type Declarations = Map<string, Map<string, string>>;

/** Collects `selector -> property -> value` for the given properties, keyed by the media query the rule sits in. */
function collect(css: string, properties: readonly string[]): Declarations {
  const found: Declarations = new Map();
  let media = "";
  const pattern = /(@media[^{]+)\{|([^{}@]+)\{([^{}]*)\}|\}/g;
  for (const match of css.matchAll(pattern)) {
    if (match[1] !== undefined) media = match[1].trim();
    else if (match[2] !== undefined) {
      const key = `${media} ${match[2].trim()}`.trim();
      for (const line of match[3]!.split(";")) {
        const [property, ...value] = line.split(":");
        const name = property?.trim() ?? "";
        if (!properties.includes(name)) continue;
        if (!found.has(key)) found.set(key, new Map());
        found.get(key)!.set(name, value.join(":").trim());
      }
    } else media = "";
  }
  return found;
}

describe("update-notice.css physical fallback", () => {
  const supportsAt = CSS.indexOf(SUPPORTS);
  const main = CSS.slice(0, supportsAt);
  const fallback = CSS.slice(supportsAt + SUPPORTS.length);

  it("has exactly one fallback block, after every logical rule", () => {
    expect(supportsAt).toBeGreaterThan(0);
    expect(CSS.indexOf(SUPPORTS, supportsAt + 1)).toBe(-1);
    expect(fallback).not.toMatch(/inset-(?:block|inline)/);
  });

  it("gives every logical inset a physical fallback with the same value", () => {
    const logical = collect(main, Object.keys(PHYSICAL));
    const physical = collect(fallback, Object.values(PHYSICAL));
    expect(logical.size).toBeGreaterThan(0);
    for (const [selector, declarations] of logical) {
      for (const [property, value] of declarations) {
        expect(physical.get(selector)?.get(PHYSICAL[property]!), `${selector} ${property}`).toBe(value);
      }
    }
  });
});
