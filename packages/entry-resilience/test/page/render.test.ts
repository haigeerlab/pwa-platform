import { describe, expect, it } from "vitest";
import { renderPage } from "../../src/page/render.js";
import type { PageDocument, PageElement } from "../../src/page/render.js";
import type { EntryPageModel } from "../../src/page/model.js";
import { ENTRY_PAGE_MESSAGES } from "../../src/page/messages.js";

/** The `zh-CN` built-in table — every existing assertion in this file was written against these exact strings
 *  before locale/messages existed, so passing them through unmerged reproduces the old hard-coded behaviour. */
const MESSAGES = ENTRY_PAGE_MESSAGES["zh-CN"];

/** A fake `PageElement` that records everything `renderPage` does to it, so assertions can inspect the tree it
 *  built without a real DOM. Extra fields beyond `PageElement`'s own contract (`tag`, `children`, `attributes`,
 *  `listeners`) are only for the test to read back — `renderPage` itself only ever sees the `PageElement` shape. */
type FakeElement = PageElement & {
  readonly tag: string;
  readonly children: readonly FakeElement[];
  readonly attributes: ReadonlyMap<string, string>;
  readonly listeners: readonly (() => void)[];
};

function createFakeElement(tag: string): FakeElement {
  let text: string | null = null;
  const children: FakeElement[] = [];
  const attributes = new Map<string, string>();
  const listeners: (() => void)[] = [];
  return {
    tag,
    get textContent(): string | null {
      return text;
    },
    // Mirrors real DOM: assigning textContent replaces all children with a single text node (or none, for "").
    set textContent(value: string | null) {
      text = value;
      children.length = 0;
    },
    get children(): readonly FakeElement[] {
      return children;
    },
    get attributes(): ReadonlyMap<string, string> {
      return attributes;
    },
    get listeners(): readonly (() => void)[] {
      return listeners;
    },
    append(...kids: PageElement[]): void {
      children.push(...(kids as FakeElement[]));
    },
    setAttribute(name: string, value: string): void {
      attributes.set(name, value);
    },
    addEventListener(_type: "click", listener: () => void): void {
      listeners.push(listener);
    },
  };
}

function setup(): { readonly doc: PageDocument; readonly root: FakeElement; readonly navigate: (href: string) => void; readonly calls: string[] } {
  const calls: string[] = [];
  const doc: PageDocument = { createElement: (tag) => createFakeElement(tag) };
  const root = createFakeElement("div");
  return { doc, root, navigate: (href: string): void => void calls.push(href), calls };
}

const EXPIRES_AT = "2026-10-01 08:00 UTC";

describe("renderPage", () => {
  it("renders the loading state as a single paragraph", () => {
    const { doc, root, navigate } = setup();
    renderPage(root, "loading", doc, navigate, MESSAGES);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]?.tag).toBe("p");
    expect(root.children[0]?.textContent).toBe("正在检查备用入口…");
  });

  it("renders the none model as a single paragraph", () => {
    const { doc, root, navigate } = setup();
    renderPage(root, { kind: "none" }, doc, navigate, MESSAGES);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]?.tag).toBe("p");
    expect(root.children[0]?.textContent).toBe("当前没有可用的备用入口");
  });

  // spec/pwa-entry-resilience.md's "修订：恢复页的默认样式与宿主定制" class table (public contract): every element
  // renderPage creates carries exactly the class from that table, and nothing else. See also
  // test/page/class-alignment.test.ts for the reverse direction (every default-stylesheet `.pwa-entry…` class
  // selector is produced by the renderer).
  describe("classes (spec's class table)", () => {
    it("sets pwa-entry on the root, in every model state", () => {
      for (const model of [
        "loading" as const,
        { kind: "none" as const },
        { kind: "entries" as const, status: "migrating" as const, message: null, expiresAt: EXPIRES_AT, entries: [] },
      ]) {
        const { doc, root, navigate } = setup();
        renderPage(root, model, doc, navigate, MESSAGES);
        expect(root.attributes.get("class")).toBe("pwa-entry");
      }
    });

    it("sets pwa-entry__loading on the loading paragraph", () => {
      const { doc, root, navigate } = setup();
      renderPage(root, "loading", doc, navigate, MESSAGES);
      expect(root.children[0]?.attributes.get("class")).toBe("pwa-entry__loading");
    });

    it("sets pwa-entry__empty on the no-entries paragraph", () => {
      const { doc, root, navigate } = setup();
      renderPage(root, { kind: "none" }, doc, navigate, MESSAGES);
      expect(root.children[0]?.attributes.get("class")).toBe("pwa-entry__empty");
    });

    it("sets pwa-entry__headline, __message, __expiry, __list, __item and __button, and no extra class", () => {
      const { doc, root, navigate } = setup();
      const model: EntryPageModel = {
        kind: "entries",
        status: "incident",
        message: "网络故障排查中",
        expiresAt: EXPIRES_AT,
        entries: [{ host: "new.example.com", href: "https://new.example.com/app/" }],
      };
      renderPage(root, model, doc, navigate, MESSAGES);

      const [heading, message, expiry, list] = root.children;
      expect(heading?.attributes.get("class")).toBe("pwa-entry__headline");
      expect(message?.attributes.get("class")).toBe("pwa-entry__message");
      expect(expiry?.attributes.get("class")).toBe("pwa-entry__expiry");
      expect(list?.attributes.get("class")).toBe("pwa-entry__list");

      const item = list?.children[0];
      expect(item?.attributes.get("class")).toBe("pwa-entry__item");
      const button = item?.children[0];
      expect(button?.attributes.get("class")).toBe("pwa-entry__button");

      // No extra class attribute anywhere: every element above has exactly one class-bearing attribute, "class".
      for (const element of [root, heading, message, expiry, list, item, button]) {
        expect([...(element?.attributes.keys() ?? [])].filter((name) => name === "class")).toHaveLength(1);
      }
    });
  });

  it.each([
    ["migrating", "应用正在迁移到新地址"],
    ["incident", "应用当前的入口出现故障"],
    ["unconfirmed-outage", "主入口可能暂时无法访问（未经确认）"],
  ] as const)("renders the %s headline as an h1", (status, headline) => {
    const { doc, root, navigate } = setup();
    const model: EntryPageModel = { kind: "entries", status, message: null, expiresAt: EXPIRES_AT, entries: [] };
    renderPage(root, model, doc, navigate, MESSAGES);
    expect(root.children[0]?.tag).toBe("h1");
    expect(root.children[0]?.textContent).toBe(headline);
  });

  it("renders the message paragraph only when the model carries one", () => {
    const { doc, root, navigate } = setup();
    const withMessage: EntryPageModel = {
      kind: "entries",
      status: "incident",
      message: "网络故障排查中",
      expiresAt: EXPIRES_AT,
      entries: [],
    };
    renderPage(root, withMessage, doc, navigate, MESSAGES);
    expect(root.children.map((child) => child.tag)).toEqual(["h1", "p", "p", "ul"]);
    expect(root.children[1]?.textContent).toBe("网络故障排查中");
    expect(root.children[2]?.textContent).toBe(`此通知有效期至 ${EXPIRES_AT}`);
  });

  it("omits the message paragraph when the model's message is null", () => {
    const { doc, root, navigate } = setup();
    const withoutMessage: EntryPageModel = {
      kind: "entries",
      status: "incident",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [],
    };
    renderPage(root, withoutMessage, doc, navigate, MESSAGES);
    expect(root.children.map((child) => child.tag)).toEqual(["h1", "p", "ul"]);
  });

  it("shows a host containing `$` patterns literally in the button label", () => {
    // `new URL("https://a$&b.example").host` is "a$&b.example": a valid host, and `$&` is a string-replacement pattern.
    const { doc, root, navigate } = setup();
    const model: EntryPageModel = {
      kind: "entries",
      status: "migrating",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [{ host: "a$&b$'c.example", href: "https://example.com/app/" }],
    };
    renderPage(root, model, doc, navigate, MESSAGES);
    const button = root.children.at(-1)?.children[0]?.children[0];
    expect(button?.textContent).toBe(MESSAGES.go.replace("{host}", () => "a$&b$'c.example"));
    expect(button?.textContent).toContain("a$&b$'c.example");
  });

  it("renders one li>button per entry, labelled with the host, type=button, and no href-bearing attribute", () => {
    const { doc, root, navigate, calls } = setup();
    const model: EntryPageModel = {
      kind: "entries",
      status: "migrating",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [
        { host: "new.example.com", href: "https://new.example.com/app/" },
        { host: "alt.example.com", href: "https://alt.example.com/app/" },
      ],
    };
    renderPage(root, model, doc, navigate, MESSAGES);

    // Never navigates while rendering, regardless of entry count.
    expect(calls).toHaveLength(0);

    const list = root.children.at(-1);
    expect(list?.tag).toBe("ul");
    expect(list?.children).toHaveLength(2);

    const [firstItem, secondItem] = list?.children ?? [];
    expect(firstItem?.tag).toBe("li");
    const firstButton = firstItem?.children[0];
    expect(firstButton?.tag).toBe("button");
    expect(firstButton?.textContent).toBe("前往 new.example.com");
    expect(firstButton?.attributes.get("type")).toBe("button");
    // No attribute anywhere on the button carries the href — it exists only in the click closure.
    expect([...(firstButton?.attributes.values() ?? [])]).not.toContain("https://new.example.com/app/");

    expect(firstButton?.listeners).toHaveLength(1);
    firstButton?.listeners[0]?.();
    expect(calls).toEqual(["https://new.example.com/app/"]);

    const secondButton = secondItem?.children[0];
    secondButton?.listeners[0]?.();
    expect(calls).toEqual(["https://new.example.com/app/", "https://alt.example.com/app/"]);
  });

  it("never calls navigate during rendering, even with exactly one entry", () => {
    const { doc, root, navigate, calls } = setup();
    const model: EntryPageModel = {
      kind: "entries",
      status: "migrating",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [{ host: "new.example.com", href: "https://new.example.com/app/" }],
    };
    renderPage(root, model, doc, navigate, MESSAGES);
    expect(calls).toHaveLength(0);
  });

  it("clears root before re-rendering, so stale content from a previous render does not remain", () => {
    const { doc, root, navigate } = setup();
    renderPage(root, "loading", doc, navigate, MESSAGES);
    expect(root.children.some((child) => child.textContent === "正在检查备用入口…")).toBe(true);

    renderPage(root, { kind: "none" }, doc, navigate, MESSAGES);
    expect(root.children).toHaveLength(1);
    expect(root.children.some((child) => child.textContent === "正在检查备用入口…")).toBe(false);
    expect(root.children[0]?.textContent).toBe("当前没有可用的备用入口");
  });
});

// spec/pwa-entry-resilience.md's "修订：恢复页的构建期语言与文案覆盖": the en built-in table renders correctly for
// loading, none, each status headline, expiry and the go button — independently of the zh-CN-only assertions above.
describe("renderPage: en locale", () => {
  const EN = ENTRY_PAGE_MESSAGES["en"];

  it("renders the loading state with the en copy", () => {
    const { doc, root, navigate } = setup();
    renderPage(root, "loading", doc, navigate, EN);
    expect(root.children[0]?.textContent).toBe("Checking for alternative entries…");
  });

  it("renders the none state with the en copy", () => {
    const { doc, root, navigate } = setup();
    renderPage(root, { kind: "none" }, doc, navigate, EN);
    expect(root.children[0]?.textContent).toBe("No alternative entry is available right now");
  });

  it.each([
    ["migrating", "This app is moving to a new address"],
    ["incident", "This app's usual address is having problems"],
    ["unconfirmed-outage", "The usual address may be unreachable (unconfirmed)"],
  ] as const)("renders the %s headline in en", (status, headline) => {
    const { doc, root, navigate } = setup();
    const model: EntryPageModel = { kind: "entries", status, message: null, expiresAt: EXPIRES_AT, entries: [] };
    renderPage(root, model, doc, navigate, EN);
    expect(root.children[0]?.textContent).toBe(headline);
  });

  it("renders the expiry paragraph with the {expiresAt} placeholder substituted, in en", () => {
    const { doc, root, navigate } = setup();
    const model: EntryPageModel = {
      kind: "entries",
      status: "incident",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [],
    };
    renderPage(root, model, doc, navigate, EN);
    expect(root.children[1]?.textContent).toBe(`This notice is valid until ${EXPIRES_AT}`);
  });

  it("renders each entry's button with the {host} placeholder substituted, in en", () => {
    const { doc, root, navigate } = setup();
    const model: EntryPageModel = {
      kind: "entries",
      status: "migrating",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [{ host: "new.example.com", href: "https://new.example.com/app/" }],
    };
    renderPage(root, model, doc, navigate, EN);
    const button = root.children.at(-1)?.children[0]?.children[0];
    expect(button?.textContent).toBe("Go to new.example.com");
  });
});

describe("renderPage: messages override", () => {
  it("uses an overridden message in place of the built-in one, leaving the rest of the built-in table intact", () => {
    const { doc, root, navigate } = setup();
    const overridden = { ...MESSAGES, loading: "自定义加载中文案" };
    renderPage(root, "loading", doc, navigate, overridden);
    expect(root.children[0]?.textContent).toBe("自定义加载中文案");
  });

  it("substitutes the placeholder inside an overridden expiry/go message the same way as the built-in one", () => {
    const { doc, root, navigate } = setup();
    const overridden = { ...MESSAGES, expiry: "Custom: valid until {expiresAt}", go: "Custom: continue to {host}" };
    const model: EntryPageModel = {
      kind: "entries",
      status: "incident",
      message: null,
      expiresAt: EXPIRES_AT,
      entries: [{ host: "new.example.com", href: "https://new.example.com/app/" }],
    };
    renderPage(root, model, doc, navigate, overridden);
    expect(root.children[1]?.textContent).toBe(`Custom: valid until ${EXPIRES_AT}`);
    const button = root.children.at(-1)?.children[0]?.children[0];
    expect(button?.textContent).toBe("Custom: continue to new.example.com");
  });
});
