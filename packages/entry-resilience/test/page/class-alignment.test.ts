// Both halves of the architecture decision recorded in tasks/pwa-entry-resilience/plan.md's "修订：恢复页的默认样
// 式与宿主定制" -> "架构决定": "两者由测试对齐：渲染用到的每个 class 都必须在默认样式中出现，反之亦然，避免样式与
// 结构各自漂移." Renders every branch src/page/render.ts's renderPage has, collects the classes it actually sets,
// and compares that set against every `.pwa-entry…` class selector `src/vite/default-style.ts` defines — in both
// directions, so neither file can drift from the other unnoticed.
import { describe, expect, it } from "vitest";
import { renderPage } from "../../src/page/render.js";
import type { PageDocument, PageElement } from "../../src/page/render.js";
import type { EntryPageModel } from "../../src/page/model.js";
import { DEFAULT_RECOVERY_PAGE_STYLE } from "../../src/vite/default-style.js";
import { ENTRY_PAGE_MESSAGES } from "../../src/page/messages.js";

const MESSAGES = ENTRY_PAGE_MESSAGES["zh-CN"];

type FakeElement = PageElement & { readonly children: readonly FakeElement[]; readonly classes: readonly string[] };

function createFakeElement(): FakeElement {
  let text: string | null = null;
  const children: FakeElement[] = [];
  const classes: string[] = [];
  return {
    get textContent(): string | null {
      return text;
    },
    set textContent(value: string | null) {
      text = value;
      children.length = 0;
    },
    get children(): readonly FakeElement[] {
      return children;
    },
    get classes(): readonly string[] {
      return classes;
    },
    append(...kids: PageElement[]): void {
      children.push(...(kids as FakeElement[]));
    },
    setAttribute(name: string, value: string): void {
      if (name === "class") classes.push(value);
    },
    addEventListener(): void {
      // Not exercised: alignment only cares about which classes are set, not click behavior.
    },
  };
}

const doc: PageDocument = { createElement: () => createFakeElement() };
const navigate = (): void => undefined;

/** Every class renderPage sets on any element, across a render of every branch it has: loading, none, each status
 *  headline, with and without a message, and with one rendered entry (so the list/item/button branch runs too). */
function classesUsedByRenderer(): ReadonlySet<string> {
  const used = new Set<string>();
  const collect = (root: FakeElement): void => {
    for (const className of root.classes) used.add(className);
    for (const child of root.children) collect(child);
  };

  const loadingRoot = createFakeElement();
  renderPage(loadingRoot, "loading", doc, navigate, MESSAGES);
  collect(loadingRoot);

  const noneRoot = createFakeElement();
  renderPage(noneRoot, { kind: "none" }, doc, navigate, MESSAGES);
  collect(noneRoot);

  const entriesModel: EntryPageModel = {
    kind: "entries",
    status: "migrating",
    message: "示例原因",
    expiresAt: "2026-10-01 08:00 UTC",
    entries: [{ host: "new.example.com", href: "https://new.example.com/app/" }],
  };
  const entriesRoot = createFakeElement();
  renderPage(entriesRoot, entriesModel, doc, navigate, MESSAGES);
  collect(entriesRoot);

  return used;
}

/** Every `.pwa-entry…` class token the default stylesheet's selectors reference, deduplicated. Deliberately does
 *  not match `--pwa-entry-*` custom-property names (those start with `--`, not `.`) or the `[data-theme="dark"]`
 *  attribute selectors (matched only up to the class name itself, same as a real CSS selector parser would treat
 *  the compound selector `.pwa-entry[data-theme="dark"]`). */
function classesInDefaultStyle(): ReadonlySet<string> {
  const matches = DEFAULT_RECOVERY_PAGE_STYLE.matchAll(/\.pwa-entry(?:__[a-z-]+)?\b/g);
  return new Set([...matches].map((match) => match[0].slice(1)));
}

describe("class alignment: src/page/render.ts <-> src/vite/default-style.ts", () => {
  it("has renderer classes to compare (the check below means nothing on an empty set)", () => {
    expect(classesUsedByRenderer().size).toBeGreaterThan(0);
    expect(classesInDefaultStyle().size).toBeGreaterThan(0);
  });

  it("every class the renderer sets appears in the default stylesheet", () => {
    const style = classesInDefaultStyle();
    const missing = [...classesUsedByRenderer()].filter((name) => !style.has(name));
    expect(missing).toEqual([]);
  });

  it("every .pwa-entry… class selector in the default stylesheet is produced by the renderer", () => {
    const used = classesUsedByRenderer();
    const extra = [...classesInDefaultStyle()].filter((name) => !used.has(name));
    expect(extra).toEqual([]);
  });

  it("is exactly the nine classes spec's class table lists, matching by name so a typo on either side fails loudly", () => {
    const expected = [
      "pwa-entry",
      "pwa-entry__headline",
      "pwa-entry__message",
      "pwa-entry__expiry",
      "pwa-entry__list",
      "pwa-entry__item",
      "pwa-entry__button",
      "pwa-entry__empty",
      "pwa-entry__loading",
    ].sort();
    expect([...classesUsedByRenderer()].sort()).toEqual(expected);
    expect([...classesInDefaultStyle()].sort()).toEqual(expected);
  });
});

/** Every `--pwa-entry-*` custom property the stylesheet declares, and every one it reads back through `var()`. */
function firstGroups(pattern: RegExp): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of DEFAULT_RECOVERY_PAGE_STYLE.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

function tokensDeclared(): ReadonlySet<string> {
  return firstGroups(/(--pwa-entry-[a-z-]+):/g);
}

function tokensRead(): ReadonlySet<string> {
  return firstGroups(/var\((--pwa-entry-[a-z-]+)\)/g);
}

describe("custom properties: spec's token table <-> src/vite/default-style.ts", () => {
  it("declares exactly the tokens the spec's revision advertises", () => {
    expect([...tokensDeclared()].sort()).toEqual(
      [
        "--pwa-entry-accent",
        "--pwa-entry-accent-fg",
        "--pwa-entry-bg",
        "--pwa-entry-fg",
        "--pwa-entry-font",
        "--pwa-entry-max-width",
        "--pwa-entry-muted",
        "--pwa-entry-radius",
      ].sort(),
    );
  });

  // A token nothing reads is a promise the platform cannot keep: a host overriding it sees no change at all. Two
  // of them (--pwa-entry-surface, --pwa-entry-border) went dead when the list items lost their own chrome, and no
  // other test noticed.
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
      const match = DEFAULT_RECOVERY_PAGE_STYLE.match(pattern);
      if (match?.[1] === undefined) throw new Error(`dark block not found: ${pattern.source}`);
      return [...match[1].matchAll(/(--pwa-entry-[a-z-]+):\s*([^;]+);/g)].map(
        (declaration) => `${declaration[1]}:${declaration[2]?.trim() ?? ""}`,
      );
    };

    const mediaQueryBlock = declarationsIn(
      /@media \(prefers-color-scheme: dark\) \{\s*\.pwa-entry:not\(\[data-theme="light"\]\) \{([^}]*)\}/,
    );
    const attributeBlock = declarationsIn(/\.pwa-entry\[data-theme="dark"\] \{([^}]*)\}/);

    expect(mediaQueryBlock.length).toBe(5);
    expect(mediaQueryBlock).toEqual(attributeBlock);
  });
});
