// spec/vite-adapter.md's "修订：平台默认离线页（2026-09-24，已评审通过）" -> "测试策略增量": "class 集合与默认样式
// 选择器集合双向一致（同恢复页的 class-alignment 测试）". Mirrors
// packages/entry-resilience/test/page/class-alignment.test.ts's approach: collect every class the render function
// actually outputs across its branches, collect every `.pwa-offline…` selector the default stylesheet declares,
// and assert the two sets are identical in both directions.
import { describe, expect, it } from "vitest";
import { renderOfflinePage } from "../src/offline-page.js";
import { DEFAULT_OFFLINE_PAGE_STYLE } from "../src/offline-page-style.js";

/** Every `class="..."` token used across a render of both branches the page has: with and without an app name (the
 *  only structural branch renderOfflinePage has). */
async function classesUsedByRenderer(): Promise<ReadonlySet<string>> {
  const used = new Set<string>();
  const withApp = await renderOfflinePage({ locale: "zh-CN", appName: "示例应用" });
  const withoutApp = await renderOfflinePage({ locale: "zh-CN", appName: null });
  for (const html of [withApp.html, withoutApp.html]) {
    for (const match of html.matchAll(/class="([^"]+)"/g)) {
      for (const className of (match[1] ?? "").split(/\s+/).filter((value) => value.length > 0)) used.add(className);
    }
  }
  return used;
}

/** Every `.pwa-offline…` class token the default stylesheet's selectors reference, deduplicated. Deliberately does
 *  not match `--pwa-offline-*` custom-property names (those start with `--`, not `.`) or the `[data-theme="dark"]`
 *  attribute selectors past the class name itself. */
function classesInDefaultStyle(): ReadonlySet<string> {
  const matches = DEFAULT_OFFLINE_PAGE_STYLE.matchAll(/\.pwa-offline(?:__[a-z-]+)?\b/g);
  return new Set([...matches].map((match) => match[0].slice(1)));
}

describe("class alignment: src/offline-page.ts <-> src/offline-page-style.ts", () => {
  it("has renderer classes to compare (the check below means nothing on an empty set)", async () => {
    expect((await classesUsedByRenderer()).size).toBeGreaterThan(0);
    expect(classesInDefaultStyle().size).toBeGreaterThan(0);
  });

  it("every class the renderer emits appears in the default stylesheet", async () => {
    const style = classesInDefaultStyle();
    const missing = [...(await classesUsedByRenderer())].filter((name) => !style.has(name));
    expect(missing).toEqual([]);
  });

  it("every .pwa-offline… class selector in the default stylesheet is produced by the renderer", async () => {
    const used = await classesUsedByRenderer();
    const extra = [...classesInDefaultStyle()].filter((name) => !used.has(name));
    expect(extra).toEqual([]);
  });

  it("is exactly the five classes spec's class table lists, matching by name so a typo on either side fails loudly", async () => {
    const expected = [
      "pwa-offline",
      "pwa-offline__app",
      "pwa-offline__heading",
      "pwa-offline__body",
      "pwa-offline__retry",
    ].sort();
    expect([...(await classesUsedByRenderer())].sort()).toEqual(expected);
    expect([...classesInDefaultStyle()].sort()).toEqual(expected);
  });
});

/** Every `--pwa-offline-*` custom property the stylesheet declares, and every one it reads back through `var()`. */
function firstGroups(pattern: RegExp): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of DEFAULT_OFFLINE_PAGE_STYLE.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

function tokensDeclared(): ReadonlySet<string> {
  return firstGroups(/(--pwa-offline-[a-z-]+):/g);
}

function tokensRead(): ReadonlySet<string> {
  return firstGroups(/var\((--pwa-offline-[a-z-]+)\)/g);
}

describe("custom properties: spec's token table <-> src/offline-page-style.ts", () => {
  it("declares exactly the tokens the spec's revision advertises", () => {
    expect([...tokensDeclared()].sort()).toEqual(
      [
        "--pwa-offline-accent",
        "--pwa-offline-accent-fg",
        "--pwa-offline-bg",
        "--pwa-offline-fg",
        "--pwa-offline-font",
        "--pwa-offline-max-width",
        "--pwa-offline-muted",
        "--pwa-offline-radius",
      ].sort(),
    );
  });

  it("reads every token it declares, so overriding any advertised token actually changes the page", () => {
    const read = tokensRead();
    expect([...tokensDeclared()].filter((name) => !read.has(name))).toEqual([]);
  });

  it("declares every token it reads, so the page never falls back to an unset custom property", () => {
    const declared = tokensDeclared();
    expect([...tokensRead()].filter((name) => !declared.has(name))).toEqual([]);
  });

  it("redefines the same colour tokens in both dark blocks, so the two ways of going dark agree", () => {
    const declarationsIn = (pattern: RegExp): readonly string[] => {
      const match = DEFAULT_OFFLINE_PAGE_STYLE.match(pattern);
      if (match?.[1] === undefined) throw new Error(`dark block not found: ${pattern.source}`);
      return [...match[1].matchAll(/(--pwa-offline-[a-z-]+):\s*([^;]+);/g)].map(
        (declaration) => `${declaration[1]}:${declaration[2]?.trim() ?? ""}`,
      );
    };

    const mediaQueryBlock = declarationsIn(
      /@media \(prefers-color-scheme: dark\) \{\s*\.pwa-offline:not\(\[data-theme="light"\]\) \{([^}]*)\}/,
    );
    const attributeBlock = declarationsIn(/\.pwa-offline\[data-theme="dark"\] \{([^}]*)\}/);

    expect(mediaQueryBlock.length).toBe(5);
    expect(mediaQueryBlock).toEqual(attributeBlock);
  });
});
