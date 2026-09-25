// src/page/messages.ts: the built-in copy tables and the merge helper — see spec/pwa-entry-resilience.md's "修
// 订：恢复页的构建期语言与文案覆盖".
import { describe, expect, it } from "vitest";
import { ENTRY_PAGE_MESSAGE_KEYS, ENTRY_PAGE_MESSAGES, mergeEntryPageMessages } from "../../src/page/messages.js";
import type { PwaEntryPageMessages } from "../../src/page/messages.js";

describe("ENTRY_PAGE_MESSAGES: zh-CN", () => {
  // Pins the zh-CN table against the exact literals src/page/render.ts hard-coded before this revision — a typo on
  // either side (the table or this test) fails loudly. See spec's "未设置 locale 与 messages 时，产物与本修订前逐
  // 字节相同".
  it("is character-for-character the page's previous hard-coded copy", () => {
    const expected: PwaEntryPageMessages = {
      documentTitle: "备用入口",
      loading: "正在检查备用入口…",
      empty: "当前没有可用的备用入口",
      headlineMigrating: "应用正在迁移到新地址",
      headlineIncident: "应用当前的入口出现故障",
      headlineUnconfirmedOutage: "主入口可能暂时无法访问（未经确认）",
      expiry: "此通知有效期至 {expiresAt}",
      go: "前往 {host}",
    };
    expect(ENTRY_PAGE_MESSAGES["zh-CN"]).toEqual(expected);
  });
});

describe("ENTRY_PAGE_MESSAGES: en", () => {
  it("matches the spec's contract table", () => {
    const expected: PwaEntryPageMessages = {
      documentTitle: "Alternative entry",
      loading: "Checking for alternative entries…",
      empty: "No alternative entry is available right now",
      headlineMigrating: "This app is moving to a new address",
      headlineIncident: "This app's usual address is having problems",
      headlineUnconfirmedOutage: "The usual address may be unreachable (unconfirmed)",
      expiry: "This notice is valid until {expiresAt}",
      go: "Go to {host}",
    };
    expect(ENTRY_PAGE_MESSAGES["en"]).toEqual(expected);
  });
});

describe("ENTRY_PAGE_MESSAGE_KEYS", () => {
  it("is exactly the keys of PwaEntryPageMessages, for both locales", () => {
    const expected = [
      "documentTitle",
      "loading",
      "empty",
      "headlineMigrating",
      "headlineIncident",
      "headlineUnconfirmedOutage",
      "expiry",
      "go",
    ].sort();
    expect([...ENTRY_PAGE_MESSAGE_KEYS].sort()).toEqual(expected);
    expect(Object.keys(ENTRY_PAGE_MESSAGES["zh-CN"]).sort()).toEqual(expected);
    expect(Object.keys(ENTRY_PAGE_MESSAGES["en"]).sort()).toEqual(expected);
  });
});

describe("mergeEntryPageMessages", () => {
  it("returns the built-in table verbatim when no override is given", () => {
    expect(mergeEntryPageMessages("zh-CN")).toEqual(ENTRY_PAGE_MESSAGES["zh-CN"]);
    expect(mergeEntryPageMessages("en")).toEqual(ENTRY_PAGE_MESSAGES["en"]);
  });

  it("applies an override key by key, leaving every other key at its built-in value", () => {
    const merged = mergeEntryPageMessages("en", { documentTitle: "Custom title", go: "Continue to {host}" });
    expect(merged).toEqual({
      ...ENTRY_PAGE_MESSAGES["en"],
      documentTitle: "Custom title",
      go: "Continue to {host}",
    });
  });

  it("an empty override object changes nothing", () => {
    expect(mergeEntryPageMessages("zh-CN", {})).toEqual(ENTRY_PAGE_MESSAGES["zh-CN"]);
  });
});
