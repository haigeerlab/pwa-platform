// Built-in locale tables for PwaUpdateNotice (ADR-0039, "增补：内置语言选择"). The component itself renders
// nothing when no update is waiting, so there is no DOM tree to inspect in Node without a renderer — this suite
// pins the built-in tables the component reads. How the component merges `messages` over them is verified where it
// actually renders: the Playwright scenarios in examples-browser-e2e/ui-browser-tests/update-notice.spec.ts.
import { describe, expect, it } from "vitest";
import { PWA_UPDATE_NOTICE_MESSAGES, type PwaUpdateNoticeLocale, type PwaUpdateNoticeMessages } from "../src/ui.js";

/** The Chinese defaults exactly as they were before this locale addition — must never drift. */
const ZH_MESSAGES: PwaUpdateNoticeMessages = {
  readyTitle: "有可用更新",
  readyBody: "新版离线资源已准备好，你可以在合适的时候更新。",
  update: "更新",
  later: "稍后",
  updatingTitle: "正在更新",
  updatingBody: "正在切换离线资源，请稍候。",
  reloadTitle: "更新已完成",
  reloadBody: "需要时刷新页面，以确保使用最新内容。",
  reload: "刷新页面",
  errorTitle: "更新未完成",
  errorBody: "请检查连接后重试。",
  retry: "重试",
};

/** The English copy already verified on real devices via the public examples. */
const EN_MESSAGES: PwaUpdateNoticeMessages = {
  readyTitle: "A new version is available",
  readyBody: "The new offline resources are ready. Update when it suits you.",
  update: "Update",
  later: "Later",
  updatingTitle: "Updating",
  updatingBody: "Switching offline resources. Please wait.",
  reloadTitle: "Update complete",
  reloadBody: "Reload this page when you're ready to use the latest version.",
  reload: "Reload page",
  errorTitle: "Update incomplete",
  errorBody: "Check your connection and try again.",
  retry: "Retry",
};

const MESSAGE_KEYS = Object.keys(ZH_MESSAGES) as readonly (keyof PwaUpdateNoticeMessages)[];

describe("PwaUpdateNotice built-in locales", () => {
  it("defaults to the Chinese copy, byte-for-byte unchanged", () => {
    expect(PWA_UPDATE_NOTICE_MESSAGES["zh-CN"]).toEqual(ZH_MESSAGES);
  });

  it("has an English table with all 12 keys", () => {
    const locale: PwaUpdateNoticeLocale = "en";
    expect(Object.keys(PWA_UPDATE_NOTICE_MESSAGES[locale]).sort()).toEqual([...MESSAGE_KEYS].sort());
    expect(PWA_UPDATE_NOTICE_MESSAGES[locale]).toEqual(EN_MESSAGES);
  });
});
