// spec/vite-adapter.md's "修订：平台默认离线页（2026-09-24，已评审通过）" -> "测试策略增量": built-in copy, message
// overrides, HTML escaping, appName presence, the fixed retry/online-reload script, and CSP hashes. Option
// validation (diagnostic codes) is OP3's scope, not this module's — every input here is already "validated".
import { describe, expect, it } from "vitest";
import {
  OFFLINE_PAGE_MESSAGES,
  OFFLINE_PAGE_SCRIPT,
  renderOfflinePage,
  type PwaOfflinePageLocale,
} from "../src/offline-page.js";
import { DEFAULT_OFFLINE_PAGE_STYLE } from "../src/offline-page-style.js";

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

describe("OFFLINE_PAGE_MESSAGES", () => {
  it("matches spec's built-in copy table exactly for zh-CN", () => {
    expect(OFFLINE_PAGE_MESSAGES["zh-CN"]).toEqual({
      documentTitle: "离线",
      heading: "当前处于离线状态",
      body: "网络恢复后页面会自动重新加载。",
      retry: "重试",
    });
  });

  it("matches spec's built-in copy table exactly for en", () => {
    expect(OFFLINE_PAGE_MESSAGES.en).toEqual({
      documentTitle: "Offline",
      heading: "You're offline",
      body: "This page will reload when your connection is back.",
      retry: "Try again",
    });
  });
});

describe("renderOfflinePage: built-in copy and overrides", () => {
  it("uses the built-in zh-CN copy when no messages are given", async () => {
    const { html } = await renderOfflinePage({ locale: "zh-CN", appName: null });
    expect(html).toContain("<title>离线</title>");
    expect(html).toContain('<h1 class="pwa-offline__heading">当前处于离线状态</h1>');
    expect(html).toContain('<p class="pwa-offline__body">网络恢复后页面会自动重新加载。</p>');
    expect(html).toContain('<button type="button" class="pwa-offline__retry">重试</button>');
  });

  it("uses the built-in en copy when locale is en", async () => {
    const { html } = await renderOfflinePage({ locale: "en", appName: null });
    expect(html).toContain("<title>Offline</title>");
    expect(html).toContain('<h1 class="pwa-offline__heading">You&#39;re offline</h1>');
  });

  it("a partial messages override replaces only the given keys", async () => {
    const { html } = await renderOfflinePage({
      locale: "zh-CN",
      messages: { heading: "自定义标题" },
      appName: null,
    });
    expect(html).toContain('<h1 class="pwa-offline__heading">自定义标题</h1>');
    // Untouched keys keep the built-in zh-CN copy.
    expect(html).toContain("<title>离线</title>");
    expect(html).toContain('<p class="pwa-offline__body">网络恢复后页面会自动重新加载。</p>');
    expect(html).toContain('<button type="button" class="pwa-offline__retry">重试</button>');
  });

  it("a full messages override replaces every key", async () => {
    const { html } = await renderOfflinePage({
      locale: "en",
      messages: {
        documentTitle: "Custom title",
        heading: "Custom heading",
        body: "Custom body",
        retry: "Custom retry",
      },
      appName: null,
    });
    expect(html).toContain("<title>Custom title</title>");
    expect(html).toContain('<h1 class="pwa-offline__heading">Custom heading</h1>');
    expect(html).toContain('<p class="pwa-offline__body">Custom body</p>');
    expect(html).toContain('<button type="button" class="pwa-offline__retry">Custom retry</button>');
  });
});

describe("renderOfflinePage: HTML escaping", () => {
  const dangerous = { name: '<script>alert(1)</script>&"\'', };

  it("escapes a message containing <, &, \", ' as entities rather than raw markup", async () => {
    const { html } = await renderOfflinePage({
      locale: "zh-CN",
      messages: { heading: dangerous.name },
      appName: null,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      '<h1 class="pwa-offline__heading">&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;</h1>',
    );
  });

  it("escapes documentTitle inside <title>", async () => {
    const { html } = await renderOfflinePage({
      locale: "zh-CN",
      messages: { documentTitle: dangerous.name },
      appName: null,
    });
    expect(html).toContain(
      "<title>&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;</title>",
    );
  });

  it("escapes appName the same way", async () => {
    const { html } = await renderOfflinePage({
      locale: "zh-CN",
      appName: dangerous.name,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      '<p class="pwa-offline__app">&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;</p>',
    );
  });

  it("contains no raw <script> tag beyond the platform's own fixed inline script", async () => {
    const { html } = await renderOfflinePage({
      locale: "zh-CN",
      messages: { body: "<script>evil()</script>" },
      appName: "<script>evil()</script>",
    });
    const scriptTags = html.match(/<script[ >]/g) ?? [];
    // Exactly one real <script> element: the platform's own fixed inline script.
    expect(scriptTags.length).toBe(1);
    expect(html).toContain(OFFLINE_PAGE_SCRIPT);
  });
});

describe("renderOfflinePage: appName", () => {
  it("omits the pwa-offline__app element when appName is null", async () => {
    const { html } = await renderOfflinePage({ locale: "zh-CN", appName: null });
    expect(html).not.toContain('class="pwa-offline__app"');
  });

  it("renders the pwa-offline__app element when appName is given", async () => {
    const { html } = await renderOfflinePage({ locale: "zh-CN", appName: "示例应用" });
    expect(html).toContain('<p class="pwa-offline__app">示例应用</p>');
  });
});

describe("renderOfflinePage: lang attribute", () => {
  it.each<PwaOfflinePageLocale>(["zh-CN", "en"])("sets <html lang> to the given locale (%s)", async (locale) => {
    const { html } = await renderOfflinePage({ locale, appName: null });
    expect(html).toContain(`<html lang="${locale}">`);
  });
});

describe("OFFLINE_PAGE_SCRIPT", () => {
  it("clicks .pwa-offline__retry to reload, and reloads on the online event", () => {
    expect(OFFLINE_PAGE_SCRIPT).toContain('.pwa-offline__retry');
    expect(OFFLINE_PAGE_SCRIPT).toContain("location.reload()");
    expect(OFFLINE_PAGE_SCRIPT).toContain('addEventListener("online"');
  });

  it("is identical across renders regardless of locale, messages, css or appName", async () => {
    const a = await renderOfflinePage({ locale: "zh-CN", appName: null });
    const b = await renderOfflinePage({
      locale: "en",
      messages: { heading: "something else entirely" },
      css: ".host { color: red; }",
      appName: "Some App",
    });
    const extractScript = (html: string): string | undefined => html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
    expect(extractScript(a.html)).toBe(OFFLINE_PAGE_SCRIPT);
    expect(extractScript(b.html)).toBe(OFFLINE_PAGE_SCRIPT);
  });

  it("contains no configured string value (messages, css or appName never leak into the script)", async () => {
    const marker = "UNIQUE_CONFIG_MARKER_XYZ";
    await renderOfflinePage({
      locale: "zh-CN",
      messages: { heading: marker, body: marker, retry: marker, documentTitle: marker },
      css: `.host { /* ${marker} */ }`,
      appName: marker,
    });
    expect(OFFLINE_PAGE_SCRIPT).not.toContain(marker);
  });
});

describe("renderOfflinePage: CSP hashes", () => {
  /** The text between each opening tag and its closing tag, in document order — what a browser hashes for CSP. */
  function inlineContents(html: string, tag: "style" | "script"): string[] {
    return [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => match[1] ?? "");
  }

  it("hashes the default style block exactly as it appears in the page, leading newline included", async () => {
    const { html, hashes } = await renderOfflinePage({ locale: "zh-CN", appName: null });
    const [content] = inlineContents(html, "style");
    expect(content).toBe(`\n${DEFAULT_OFFLINE_PAGE_STYLE}`);
    expect(hashes.defaultStyle).toBe(await sha256Base64(content ?? ""));
  });

  it("hashes the script block exactly as it appears in the page", async () => {
    const { html, hashes } = await renderOfflinePage({ locale: "zh-CN", appName: null });
    const [content] = inlineContents(html, "script");
    expect(content).toBe(`\n${OFFLINE_PAGE_SCRIPT}`);
    expect(hashes.script).toBe(await sha256Base64(content ?? ""));
  });

  it("hostStyle hash is null when no css is given", async () => {
    const { html, hashes } = await renderOfflinePage({ locale: "zh-CN", appName: null });
    expect(hashes.hostStyle).toBeNull();
    expect(inlineContents(html, "style")).toHaveLength(1);
  });

  it("hashes the host style block exactly as it appears in the page", async () => {
    const css = ".pwa-offline { --pwa-offline-accent: #c8102e; }";
    const { html, hashes } = await renderOfflinePage({ locale: "zh-CN", css, appName: null });
    const [, content] = inlineContents(html, "style");
    expect(content).toBe(`\n${css}`);
    expect(hashes.hostStyle).toBe(await sha256Base64(content ?? ""));
  });
});
